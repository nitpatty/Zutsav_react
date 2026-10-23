# ZUTSAV — Privacy Policy PDF Viewer Production Failure Audit

- **Audit date:** 2026-10-23
- **Mode:** Read-only forensic audit. No application code, dependency manifest, lockfile, Nginx file, deployment configuration, database record, or uploaded document was changed.
- **Intended change:** This report only: `docs/PRIVACY_POLICY_PDF_VIEWER_AUDIT.md`.
- **Production URL examined:** `https://zutsav.com/legal/privacy`
- **Local environment examined:** `http://localhost:3000` (actual protocol; see §5.2) and `http://localhost:5000/api`
- **Result:** The production PDF and metadata endpoints are healthy. The failure is a client-side PDF.js worker packaging defect: the deployed worker is a Babel-transformed asset containing 11 absolute filesystem imports under `/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/`, which the browser cannot resolve. The client's broken-import hypothesis is confirmed.

## Evidence classification

| Label | Meaning |
|---|---|
| **Confirmed** | Directly observed in source, installed packages, tracked build artifacts, live HTTP responses, or an executable module/PDF test. |
| **Probable** | Strongly supported by configuration and observed artifacts, but not directly instrumented at runtime. |
| **Suspected** | Plausible and consistent with evidence, but not proven. |
| **Unresolved** | Requires access or instrumentation not available in this audit. |

No browser DevTools session or authenticated browser runtime was available. Browser-level statements below are therefore either (a) direct HTTP evidence, (b) direct module/PDF execution tests, or (c) explicitly labeled inferences from PDF.js source.

---

## 1. Executive summary

The production Privacy Policy page fails because **PDF.js cannot initialize its worker**, not because the PDF is missing, protected, corrupt, or served with the wrong MIME type.

Confirmed facts:

1. Production metadata loads successfully: `GET https://zutsav.com/api/documents/privacy` returns HTTP 200 with `exists: true`, `mimeType: application/pdf`, and a 4,050,917-byte document.
2. Production PDF bytes load successfully: `GET https://zutsav.com/api/documents/privacy/view` returns HTTP 200, `Content-Type: application/pdf`, a `%PDF-1.7` header, and a valid `%%EOF` trailer. The file parses successfully with the installed `pdfjs-dist@4.8.69` runtime (2 pages).
3. The deployed worker asset is served successfully: `GET https://zutsav.com/static/media/pdf.worker.min.0cd2aaabaa59731ff418.mjs` returns HTTP 200 with `Content-Type: application/javascript`.
4. That worker is **not self-contained**. Its first executable statements are 11 ESM imports from absolute server filesystem paths:

   ```text
   /home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/*.js
   ```

   A representative import returns HTTP 404. Importing the worker as an ES module in Node fails with `Cannot find module ...@babel/runtime/helpers/esm/arrayLikeToArray.js`.
5. The local development worker is self-contained (no imports) and imports successfully in Node. This is consistent with local rendering working.
6. The local and production sites use **different uploaded documents**. Local: `Corporate Privacy Policy.pdf`, 194,157 bytes, 3 pages. Production: `Privacy Policy Content - Zutsav.pdf`, 4,050,917 bytes, 2 pages. Local success does not prove the production document or worker path.
7. The `.mjs` MIME-type problem is resolved on the live server: the deployed worker is served as `application/javascript`. MIME is not the current blocker.

The smallest reliable fix is to stop asking the CRA production build to transform the PDF.js worker: copy the **unmodified, self-contained** `pdfjs-dist/build/pdf.worker.min.mjs` from the exact installed `pdfjs-dist` version into `frontend/public/` under a versioned filename, and point `pdfjs.GlobalWorkerOptions.workerSrc` at that public asset. The worker must remain version-matched to the runtime (`4.8.69`) and should be served with a cache-safe policy.

---

## 2. Incident timeline and observed symptoms

The exact first occurrence of the incident is not recorded in the repository or in the live responses available to this audit. The following timeline contains only observed or client-reported events.

| Time / date | Event | Source |
|---|---|---|
| 2026-10-17 09:17:27 UTC | Production Privacy Policy document last updated; current production record is `Privacy Policy Content - Zutsav.pdf` (4,050,917 bytes). | Live `GET /api/documents/privacy` |
| 2026-10-23 15:22:53 UTC | Local Privacy Policy document last updated; local record is `Corporate Privacy Policy.pdf` (194,157 bytes). | Local `GET http://localhost:5000/api/documents/privacy` |
| 2026-10-23 | Audit observed production page HTTP 200, metadata HTTP 200, PDF HTTP 200 and parseable, worker HTTP 200 but with broken absolute imports. | Live read-only checks |
| 2026-10-23 | Local worker asset observed self-contained; local PDF observed valid and different from production. | Local read-only checks |

### Reported symptoms

- Production: the Privacy Policy page shell/UI loads, but the document viewer shows:
  - `We could not load this document right now.`
  - `Please try again in a moment.`
  - A visible **Retry** button.
- Local: the developer reports PDF content renders successfully.
- Local System Configuration reportedly shows `Corporate Privacy Policy.pdf` with a recent update date.
- Client reports `react-pdf@9.2.1`, `pdfjs-dist@4.8.69`, a `new URL(..., import.meta.url)` worker pattern, absolute `/home/.../node_modules/...` worker imports in production, and a prior `.mjs` Nginx MIME fix.

---

## 3. Current PDF viewing and upload architecture

### 3.1 Admin upload and metadata path

1. Admin UI: `frontend/src/components/admin/LegalDocumentsSection.jsx`.
   - Loads metadata from `GET /api/documents` (`line 150`).
   - Uploads/replaces via `POST` or `PUT /api/admin/documents/<documentType>` with `multipart/form-data` (`lines 47-52`).
   - Deletes via `DELETE /api/admin/documents/<documentType>` (`line 68`).
   - "View" opens the in-app viewer route, not the raw PDF URL (`lines 78-80`, `frontend/src/utils/legalDocs.js:6-7`).
2. Admin route: `backend/src/routes/legalDocumentAdmin.routes.js:17-19`.
   - Mounted under `/api/admin/documents` by `backend/src/routes/admin.routes.js:24`.
   - Admin auth is applied globally by the admin router before this sub-router.
3. Upload middleware: `backend/src/middleware/upload.js:63-73`.
   - Accepts `.pdf`, `.doc`, `.docx`.
   - Requires PDF/Word MIME types.
   - 10 MB limit.
   - Stores under `uploads/legaldocs/`.
4. Metadata model: `backend/src/models/LegalDocument.js:3-17`.
   - One document per `documentType`: `privacy`, `terms`, `refund-policy`, `about-us`, `vision`.
   - Stores `originalName`, `storedFileName`, `mimeType`, `size`, `storagePath`, uploader, timestamps.
5. Upload/replace/delete controller: `backend/src/controllers/legalDocument.controller.js:67-137`.
   - Replaces old file on disk (`lines 74-78`).
   - Upserts metadata (`lines 91-95`).
   - Writes an admin audit log (`lines 97-105`).

### 3.2 Public metadata and document path

1. Public routes: `backend/src/routes/legalDocument.routes.js:4-7`.
   - `GET /api/documents` — list metadata.
   - `GET /api/documents/:type` — one document's metadata.
   - `GET /api/documents/:type/view` — stream document bytes.
   - All public; no authentication middleware.
2. Metadata response: `backend/src/controllers/legalDocument.controller.js:15-27,39-48`.
   - `viewUrl` is `/api/documents/<type>/view` only when a document exists.
3. Document bytes: `backend/src/controllers/legalDocument.controller.js:50-65`.
   - Validates document type.
   - Finds metadata.
   - Resolves `path.join(__dirname, '../..', doc.storagePath)`.
   - Returns 404 if the file is missing.
   - Sets `Content-Type` from the stored `mimeType` and `Content-Disposition: inline`.
   - Streams the file with `fs.createReadStream`.
4. Direct upload paths are deliberately blocked:
   - `backend/src/app.js:139-146` returns 403 for `/uploads/kycdocs`, `/uploads/govtids`, and `/uploads/legaldocs`.
   - The only intended public access to legal bytes is the view controller.
5. Public route mount: `backend/src/app.js:178`.

### 3.3 Frontend viewer path

- Route: `frontend/src/App.jsx:115` — `/legal/:type` → `PublicLayout` → `LegalDocumentViewerPage`.
- Viewer: `frontend/src/pages/LegalDocumentViewerPage.jsx`.
  - Imports `pdfjs`, `Document`, `Page` from `react-pdf` (`line 4`).
  - Configures the worker at module scope (`lines 13-16`).
  - Fetches metadata from `API.get('/documents/${type}')` (`line 114`).
  - Builds the PDF URL as `serverOrigin + meta.viewUrl` (`line 130`).
  - Renders `react-pdf` `Document` with that URL (`lines 192-210`).
  - DOC/DOCX uses Google's hosted viewer iframe (`lines 173-181`).
- `serverOrigin` is `API_URL` with a trailing `/api` stripped (`frontend/src/config/urls.config.js:6`).
- `API_URL` is `REACT_APP_API_URL` or `/api` (`frontend/src/config/env.config.js:4`).
- Production `REACT_APP_API_URL` is `https://zutsav.com/api` (`frontend/.env.production`).
- Local `REACT_APP_API_URL` is `http://localhost:5000/api` (`frontend/.env`).
- Axios sends credentials and attaches a bearer token if present (`frontend/src/api/axios.js:8-11,20-33`), but the legal document endpoints are public. The PDF request itself is made by PDF.js from the `Document file` URL and does not require the app's auth header.

### 3.4 Actual request chain

```text
Browser
  -> GET https://zutsav.com/legal/privacy                  (SPA HTML shell)
  -> GET https://zutsav.com/api/documents/privacy          (public metadata)
  -> builds https://zutsav.com/api/documents/privacy/view  (viewUrl + serverOrigin)
  -> react-pdf <Document file=...> -> PDF.js getDocument()
  -> PDF.js creates Worker from GlobalWorkerOptions.workerSrc
       = https://zutsav.com/static/media/pdf.worker.min.<hash>.mjs
  -> Worker response: 200 application/javascript
  -> Worker's ESM imports: /home/appuser/.../node_modules/@babel/runtime/... -> 404
  -> Worker module evaluation fails
  -> PDF.js attempts main-thread fake-worker fallback, which imports the same broken worker
  -> fake worker setup rejects
  -> <Document error> -> ReaderError UI
```

The PDF endpoint is independently healthy. A failure in the worker does **not** prove that the PDF request failed.

### 3.5 Error handling and Retry behavior

- Metadata fetch failure: `.catch(() => setStatus('error'))` (`LegalDocumentViewerPage.jsx:124`) → `ReaderError` (`line 166`).
- `Document` load failure: `error={<ReaderError retry={load} />}` (`line 196`).
- `Page` render failure: `error={<ReaderError retry={load} />}` (`line 206`).
- `ReaderError` content: `frontend/src/pages/LegalDocumentViewerPage.jsx:56-76`; exact strings are at `lines 62,65,72`.
- Retry calls `load` (`line 67`), which clears metadata and re-fetches metadata (`lines 106-125`). It does **not** change `GlobalWorkerOptions.workerSrc`, reload the worker asset, or bypass a broken worker import graph. Retrying therefore cannot repair this failure.

---

## 4. Dependency versions and worker configuration

### 4.1 Verified installed versions

Verified from `frontend/package.json`, `frontend/package-lock.json`, and installed `node_modules`:

| Package | Version | Evidence |
|---|---|---|
| `react-pdf` | `9.2.1` | `frontend/package.json:26`; `frontend/package-lock.json:15523-15525`; installed `node_modules/react-pdf/package.json` |
| `pdfjs-dist` | `4.8.69` | `frontend/package-lock.json:13313-13315`; installed `node_modules/pdfjs-dist/package.json`; worker/runtime both contain `4.8.69` |
| React | `18.3.1` installed (manifest range `^18.2.0`) | `frontend/package.json:21`; installed `node_modules/react/package.json` |
| `react-scripts` | `5.0.1` | `frontend/package.json:28`; installed package |
| Webpack | `5.107.2` | installed `frontend/node_modules/webpack/package.json` |
| `@babel/runtime` | `7.29.7` | installed package; this is the version whose helpers appear in the broken worker |
| `babel-preset-react-app` | `10.1.0` | installed package |
| Node used for audit | `v26.4.0` | local runtime |

The client's stated versions are correct. This is not a version-mismatch incident.

### 4.2 Where the worker is configured

Only one worker configuration exists in the frontend source:

- `frontend/src/pages/LegalDocumentViewerPage.jsx:13-16`:

  ```js
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();
  ```

- It runs at module scope, before the component renders `Document`.
- No other `GlobalWorkerOptions.workerSrc` assignment was found in `frontend/src`.
- No fallback PDF or public worker asset exists in `frontend/public/`; it contains only `favicon.svg` and `index.html`.

### 4.3 What the build actually emits

Production main bundle: `https://zutsav.com/static/js/main.10a452fa.js` (4,326,681 bytes, HTTP 200, `application/javascript`).

It contains the expected transformed source:

```js
hee.workerSrc = new URL(s(749), s.b).toString();
```

and module `749` returns:

```js
s.p + "static/media/pdf.worker.min.0cd2aaabaa59731ff418.mjs"
```

So the `new URL(...)` pattern itself is working: the worker URL is emitted and resolved correctly. The deployed asset URL is:

```text
https://zutsav.com/static/media/pdf.worker.min.0cd2aaabaa59731ff418.mjs
```

### 4.4 The emitted worker is transformed, not the original package worker

| Artifact | Bytes | ESM imports | Notes |
|---|---:|---:|---|
| Installed package worker: `frontend/node_modules/pdfjs-dist/build/pdf.worker.min.mjs` | 1,369,867 | 0 | Self-contained; importing it in Node succeeds. |
| Local development worker: `static/media/pdf.worker.min.d5fd4ecd74ea75c58c83.mjs` | 1,812,734 | 0 | Self-contained; importing it in Node succeeds. |
| Tracked production-mode build worker: `frontend/build/static/media/pdf.worker.min.2b3c3870fffbf2e31837.mjs` | 1,339,732 | 11 | Broken absolute imports under `C:/Users/HP/.../node_modules/@babel/runtime/helpers/esm/`. |
| Live production worker: `static/media/pdf.worker.min.0cd2aaabaa59731ff418.mjs` | 1,339,522 | 11 | Broken absolute imports under `/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/`. |

Live production worker first executable content (license header omitted):

```text
import A from"/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/arrayLikeToArray.js";
import e from"/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/toArray.js";
import t from"/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/classPrivateFieldSet2.js";
...
```

All 11 helper modules:

```text
arrayLikeToArray.js
assertClassBrand.js
asyncIterator.js
classPrivateFieldGet2.js
classPrivateFieldInitSpec.js
classPrivateFieldSet2.js
classPrivateGetter.js
classPrivateMethodInitSpec.js
defineProperty.js
slicedToArray.js
toArray.js
```

The same pattern is present in the tracked production-mode build with a Windows absolute path, which means the defect is reproducible from this working tree if a production build is run without fixing the worker strategy.

### 4.5 Why production and development differ

The evidence supports this mechanism (behavior confirmed; internal webpack ordering inferred):

- CRA's webpack config has a Babel rule for application JS (`frontend/node_modules/react-scripts/config/webpack.config.js:416-465`).
- CRA also has a Babel rule for JS/MJS outside the app source tree (`webpack.config.js:466-480`), using `babel-preset-react-app/dependencies` with `helpers: true`.
- CRA's fallback raw-asset rule explicitly excludes `.mjs` (`webpack.config.js:592-599`), so the worker `.mjs` is not simply copied as an untouched file.
- `babel-preset-react-app` defaults `absoluteRuntime` to `true` (`frontend/node_modules/babel-preset-react-app/create.js:44-55`) and configures `@babel/plugin-transform-runtime` with `absoluteRuntime` (`create.js:177-195`; same pattern in `dependencies.js`).
- Hence, when the production build transforms the worker, helper imports are written as absolute filesystem paths rather than bundle-relative or bare module specifiers.
- Development browserslist is `last 1 chrome version` (`frontend/package.json:46-48`), so Babel does not need to transform modern class/private-field syntax and does not inject the helper imports. Production browserslist is `>0.2%, not dead` (`frontend/package.json:42-45`), so Babel transforms the worker and injects the helpers.
- The local development worker observed here is self-contained with 0 imports, consistent with that explanation. The production artifact is not self-contained.

This is why the failure is production-only and why a successful local page does not validate the deployed worker.

### 4.6 Worker/runtime version parity

- Production main bundle contains `pdfjs` API version `4.8.69` (observed in the minified bundle).
- Production worker contains `4.8.69`.
- Installed `pdfjs-dist` is `4.8.69`.
- The worker API version check is therefore satisfied; this is not a worker/runtime version mismatch.

---

## 5. Local-versus-production comparison

### 5.1 Side-by-side evidence

| Area | Local | Production |
|---|---|---|
| Metadata source | `http://localhost:5000/api/documents/privacy` | `https://zutsav.com/api/documents/privacy` |
| Metadata result | HTTP 200; `exists: true` | HTTP 200; `exists: true` |
| Document name | `Corporate Privacy Policy.pdf` | `Privacy Policy Content - Zutsav.pdf` |
| Document size | 194,157 bytes | 4,050,917 bytes |
| Document updated | `2026-10-23T15:22:53.278Z` | `2026-10-17T09:17:27.952Z` |
| Actual PDF URL | `http://localhost:5000/api/documents/privacy/view` | `https://zutsav.com/api/documents/privacy/view` |
| HTTP status for PDF | 200 | 200 |
| PDF content type | `application/pdf` | `application/pdf` |
| PDF magic | `%PDF-` | `%PDF-` |
| PDF trailer | valid | `%%EOF` |
| PDF parse test | 3 pages; fingerprint `fb2be6d737dae6a797d6efa832cd2306` | 2 pages; fingerprint `9b3e62edbb532142985e63c0a0ddf7c5` |
| React-PDF version | 9.2.1 installed | Same source; exact minified dependency version not independently extractable; bundle contains react-pdf and pdfjs API 4.8.69 |
| PDF.js version | 4.8.69 installed | Bundle reports API 4.8.69; worker reports 4.8.69 |
| Worker configuration in source | `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` | Same source pattern, transformed into `new URL(module749, base)` |
| Worker URL | `http://localhost:3000/static/media/pdf.worker.min.d5fd4ecd74ea75c58c83.mjs` | `https://zutsav.com/static/media/pdf.worker.min.0cd2aaabaa59731ff418.mjs` |
| Worker HTTP status | 200 | 200 |
| Worker MIME | `application/javascript; charset=utf-8` | `application/javascript` |
| Worker imports | 0 | 11 absolute `/home/appuser/...` imports |
| Worker module import test | `LOCAL_WORKER_IMPORT=OK true` | `PROD_WORKER_IMPORT=FAIL` (`Cannot find module ...arrayLikeToArray.js`) |
| Browser error | Not captured; local module evidence is healthy | Browser DevTools not available; live HTTP + module evidence proves the worker dependency graph is broken |
| Result | Local PDF/worker path is internally consistent with successful rendering | Viewer error is explained by worker initialization/fallback failure |

### 5.2 Local protocol and URL behavior

The developer reported `https://localhost:3000/legal/privacy`, but the repository and the running environment indicate HTTP, not HTTPS:

- `frontend/.env` sets `REACT_APP_API_URL=http://localhost:5000/api` and `REACT_APP_WEB_URL=http://localhost:3000`.
- The local dev server responded to `http://localhost:3000/` with HTTP 200.
- `https://localhost:3000/legal/privacy` failed at the TLS/connection layer in the local check.
- A direct GET to `http://localhost:3000/legal/privacy` returned HTTP 404, while `/` served the CRA app. The running dev server does not appear to provide SPA history fallback for that direct deep link. This does not affect the production root cause, but it means the exact local navigation path could not be reproduced from a cold direct URL.
- The local bundle did contain the current viewer source and the local worker URL, so the running app is the relevant Zutsav frontend.

### 5.3 Same document?

**No.** Local and production use different uploaded PDF files and different metadata records. Local rendering therefore cannot validate the production document, production metadata, or production storage state. It also cannot validate the production worker, because the local dev worker is self-contained while the production worker is broken.

---

## 6. Document-download diagnostics

### 6.1 Production metadata

`GET https://zutsav.com/api/documents/privacy`:

```json
{
  "success": true,
  "document": {
    "documentType": "privacy",
    "label": "Privacy Policy",
    "exists": true,
    "originalName": "Privacy Policy Content - Zutsav.pdf",
    "mimeType": "application/pdf",
    "size": 4050917,
    "uploadedByName": "Zutsav Admin",
    "updatedAt": "2026-10-17T09:17:27.952Z",
    "viewUrl": "/api/documents/privacy/view"
  }
}
```

- Status: 200.
- Content type: `application/json; charset=utf-8`.
- No authentication, cookie, or token was used for this audit request.
- No redirect to login.
- Metadata is healthy.

### 6.2 Production PDF response

`GET https://zutsav.com/api/documents/privacy/view`:

| Check | Result |
|---|---|
| Status | 200 |
| Content-Type | `application/pdf` |
| Content-Disposition | `inline; filename="Privacy Policy Content - Zutsav.pdf"` |
| Body size | 4,050,917 bytes |
| Magic bytes | `25 50 44 46 2D 31 2E 37` (`%PDF-1.7`) |
| Trailer | `%%EOF` present |
| Authentication required | No; public route |
| Redirect to login/error page | No |
| Parseable by installed PDF.js | Yes; `pdfjs-dist@4.8.69` legacy build in Node returned 2 pages, fingerprint `9b3e62edbb532142985e63c0a0ddf7c5` |

Conclusion: **failure stages 1, 2, and 3 are ruled out** for production. Metadata loads, the endpoint returns bytes, and the bytes are a valid PDF that the matching PDF.js runtime can parse.

### 6.3 Local PDF response

`GET http://localhost:5000/api/documents/privacy/view`:

| Check | Result |
|---|---|
| Status | 200 |
| Content-Type | `application/pdf` |
| Content-Disposition | `inline; filename="Corporate Privacy Policy.pdf"` |
| Body size | 194,157 bytes |
| Magic bytes | `%PDF-` |
| Parseable by installed PDF.js | Yes; 3 pages, fingerprint `fb2be6d737dae6a797d6efa832cd2306` |

The local document is a different file with a different page count. It is not a cached or fallback copy of the production document.

---

## 7. Worker-load and import diagnostics

### 7.1 Production worker response

| Check | Result |
|---|---|
| Resolved worker URL | `https://zutsav.com/static/media/pdf.worker.min.0cd2aaabaa59731ff418.mjs` |
| Status | 200 |
| Content-Type | `application/javascript` |
| Body size | 1,339,522 bytes |
| Cloudflare cache status | `DYNAMIC` |
| Cache-Control | Not returned |
| Valid JavaScript module content | Syntactically module-shaped, but **not a valid loadable module graph** because 11 imports point to missing filesystem paths |
| Imports resolving to `/home/...` | 11 |
| Imports resolving to `node_modules/...` | 11 (under the absolute `/home/...` prefix) |
| Imports resolving to `@babel/runtime` | 11 |
| Representative import HTTP check | `/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/arrayLikeToArray.js` → **404**, `text/html` |
| MIME/CSP/CORS signal | MIME correct; no CSP header observed; same-origin; no CORS requirement |
| Version string in worker | `4.8.69` |

This is **failure stage 5**: the worker file itself loads from the network (stage 4 passes), but its dependency imports fail, so the worker module cannot evaluate.

### 7.2 Direct module-resolution test

The production worker was downloaded to a temporary directory outside the repository and imported with Node's ESM loader:

```text
PROD_WORKER_IMPORT=FAIL
Cannot find module 'C:\home\appuser\apps\zpe-v14\frontend\node_modules\@babel\runtime\helpers\esm\arrayLikeToArray.js'
imported from C:\Users\HP\AppData\Local\Temp\opencode\prod-worker.mjs
```

This is a Node ESM module-resolution test, **not** a browser reproduction. It proves the worker is not self-contained: its first dependency is an absolute filesystem path that does not exist as a deployable asset. The browser-side equivalent was confirmed separately by the HTTP 404 for the same path.

The local development worker and the raw package worker were tested the same way:

```text
LOCAL_WORKER_IMPORT=OK true
PACKAGE_WORKER_IMPORT=OK true
```

### 7.3 Why PDF.js surfaces an error instead of silently rendering on the main thread

PDF.js 4.8.69 in `frontend/node_modules/pdfjs-dist/build/pdf.mjs`:

- `line 12111`: creates `new Worker(workerSrc, { type: "module" })`.
- `line 12126`: listens for worker `error`.
- `line 12167`: `_setupFakeWorker()` fallback.
- `line 12232`: fake-worker fallback performs `await import(this.workerSrc)` — the same broken worker URL.

When the module worker fails, PDF.js attempts the fake-worker path. That path imports the same worker asset on the main thread, which again fails on the absolute `@babel/runtime` imports. The fake-worker promise rejects with `Setting up fake worker failed: ...` and the `<Document>` error path renders `ReaderError`.

This explains how a worker-only packaging failure produces the observed viewer-level error message while the PDF endpoint remains healthy.

### 7.4 Other worker alternatives ruled out

- **Worker URL 404:** ruled out; deployed worker returns 200.
- **Worker MIME wrong:** ruled out; `application/javascript`.
- **Worker version mismatch:** ruled out; both runtime and worker report `4.8.69`.
- **Worker configuration missing:** ruled out; `workerSrc` is configured at module scope and present in the production bundle.
- **More than one worker configuration:** not found in `frontend/src`; only one assignment.
- **CSP blocking worker:** no CSP header observed on the page or worker; no evidence of CSP involvement.
- **CORS blocking worker:** worker is same-origin; no CORS requirement observed.
- **Source map / dynamic import issue:** the dynamic fake-worker import targets the same broken worker; source maps are not the cause.

---

## 8. Nginx/deployment findings

### 8.1 Repository-managed configuration

- No repository-managed Nginx configuration file was found. The only deployment Dockerfile is `frontend/Dockerfile`.
- `frontend/Dockerfile:31-37` uses the stock `nginx:alpine` image, copies the build to `/usr/share/nginx/html`, exposes port 80, and starts Nginx with defaults.
- The repository Dockerfile alone does not define SPA history fallback or a custom `.mjs` MIME rule. Production clearly has additional proxy/server configuration because `https://zutsav.com/legal/privacy` returns the SPA shell with HTTP 200.
- Therefore, repository configuration cannot prove the live Nginx state. Live behavior is established only by observed HTTP responses.

### 8.2 Confirmed live behavior

| Item | Observation |
|---|---|
| Page | HTTP 200, `text/html`, Cloudflare, `CF-Cache-Status: DYNAMIC` |
| CSP | No `Content-Security-Policy` response header observed |
| `.mjs` worker | HTTP 200, `Content-Type: application/javascript` |
| Worker cache | No `Cache-Control` returned; Cloudflare `DYNAMIC` |
| Main JS | HTTP 200, `application/javascript`, `Cache-Control: public, max-age=2592000`, `CF-Cache-Status: HIT` |
| Missing asset behavior | A nonexistent path returned HTTP 200 `text/html` (SPA fallback), not 404 |
| Old tracked worker path | `.../pdf.worker.min.2b3c3870fffbf2e31837.mjs` returned HTTP 200 `text/html` because it is not present and the SPA fallback served index.html |
| CORS on PDF/worker | No CORS header observed; not needed for same-origin requests |

### 8.3 Deployment findings

1. **The MIME issue is resolved live.** The deployed worker is `application/javascript`; MIME is not the current root cause.
2. **Static fallback is risky.** Missing asset paths return HTTP 200 with `text/html`, including old worker hashes. This can mask a missing worker as a successful response; a browser module load would then fail with HTML content instead of a clean 404. The current deployed main bundle references the existing worker, so this is a risk/hygiene issue, not the observed cause.
3. **Production build is not the tracked build.** Production serves `main.10a452fa.js` and CSS `main.171e051d.css`; the tracked `frontend/build` contains `main.5cb31ad3.js` and CSS `main.b2b1a951.css`. The production worker hash (`0cd2aaab...`) also differs from the tracked worker hash (`2b3c3870...`). The exact production build commit is not recorded in the repository.
4. **The tracked build is itself defective.** `frontend/build/static/media/pdf.worker.min.2b3c3870fffbf2e31837.mjs` contains 11 absolute `C:/Users/HP/...` imports. A rebuild from the current source without changing the worker strategy will reproduce the production failure.
5. **Cache risk after remediation.** Main JS is cached for 30 days with Cloudflare `HIT`; the worker currently has no long cache header. If the fix uses an unversioned public worker filename and a long cache is later added, a client could mix an old worker with a new runtime. Use a versioned filename or a no-cache/short-cache policy.
6. **`frontend/build/` is tracked.** `git ls-files frontend/build` returns 13 tracked files. Running `npm run build` would modify tracked build artifacts in the working tree. This audit did not run a build.

---

## 9. Validation of the client's hypothesis

| Client statement | Audit finding | Status |
|---|---|---|
| Uses `react-pdf@9.2.1` and `pdfjs-dist@4.8.69` | Installed and locked versions match exactly. | **Confirmed** |
| Worker uses `new URL(..., import.meta.url)` | Present at `LegalDocumentViewerPage.jsx:13-16`; production bundle contains the transformed `new URL(module749, base)` assignment. | **Confirmed** |
| Generated production worker contains absolute imports to local `node_modules` | Live production worker contains 11 imports under `/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/`. | **Confirmed** |
| Example path `.../helpers/esm/arrayLikeToArray.js` | Exact helper appears first in the production worker. | **Confirmed** |
| Browser treats filesystem paths as website URLs and gets 404 | A representative `/home/appuser/...` path returns HTTP 404; Node ESM import fails on the same absolute helper. Browser behavior is inferred from HTTP 404 + module semantics, not captured in DevTools. | **Confirmed at HTTP/module level; browser console not captured** |
| Earlier `.mjs` MIME problem was fixed in Nginx | Live worker returns `application/javascript`; MIME is correct. | **Confirmed live** |
| Remaining problem is broken worker imports, not MIME | Worker returns 200 with correct MIME but has unresolvable imports; this is the failing stage. | **Confirmed** |
| Proposed fix: copy matching `pdf.worker.min.mjs` to `public/` and set `workerSrc = '/pdf.worker.min.mjs'` | The raw package worker is self-contained (0 imports) and version 4.8.69, so the approach addresses the proven cause. It needs versioned filename/cache handling and `PUBLIC_URL` awareness for subpath deployments. | **Validated with implementation caveats** |

### Important correction to the local assumption

The local site and production site do **not** display the same document:

- Local: `Corporate Privacy Policy.pdf`, 194,157 bytes, 3 pages.
- Production: `Privacy Policy Content - Zutsav.pdf`, 4,050,917 bytes, 2 pages.

Likewise, the local development worker is self-contained while the production worker is broken. Local rendering success therefore does not prove the production viewer is healthy, and a production worker change cannot be validated by local rendering alone.

---

## 10. Confirmed root cause or remaining uncertainty

### 10.1 Confirmed root cause

**Production-only PDF.js worker packaging failure.**

The CRA production build emits `pdf.worker.min.mjs` as a Babel-transformed asset. The transformation injects `@babel/runtime` helper imports using `absoluteRuntime` filesystem paths. The emitted worker is served correctly as `application/javascript` at `/static/media/pdf.worker.min.0cd2aaabaa59731ff418.mjs`, but its 11 imports point to `/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/*.js`, which do not exist as web URLs and return 404.

PDF.js cannot evaluate the worker module. Its main-thread fake-worker fallback imports the same broken worker and also fails. The `<Document>` error state displays the observed message. The PDF endpoint, metadata endpoint, document bytes, and MIME type are all healthy.

### 10.2 Why local works

Probable and strongly supported:

- Development browserslist (`last 1 chrome version`) avoids the Babel transforms that inject helper imports.
- The local development worker is self-contained with 0 imports and imports successfully in Node.
- The local document is also a different, smaller, valid PDF.

The local success is therefore not evidence that the production worker is healthy.

### 10.3 Remaining uncertainty

- The exact production build commit is unknown; production artifacts differ from the tracked build.
- The browser console/network trace was not captured. The worker dependency failure is proven by live HTTP 404s and module-resolution failure, but not by a DevTools recording.
- The live Nginx configuration was not available; only live response headers were observed.
- Client-side/CDN stale caches were not tested. The current deployed main bundle references the existing broken worker, so caching is not required to explain the incident.
- The exact local navigation path could not be reproduced from a cold direct URL because the running dev server returned 404 for `/legal/privacy` while serving `/`.

---

## 11. Findings with file paths and line references

### F1 — Confirmed root cause: production worker has absolute filesystem imports

- **Status:** Confirmed.
- **Severity:** Critical (viewer unusable in production).
- **Evidence:** Live production worker at `/static/media/pdf.worker.min.0cd2aaabaa59731ff418.mjs` has 11 ESM imports under `/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/`; representative import returns 404; Node ESM import fails.
- **Source pattern:** `frontend/src/pages/LegalDocumentViewerPage.jsx:13-16`.
- **Build/tooling basis:** `frontend/node_modules/react-scripts/config/webpack.config.js:466-480,592-599`; `frontend/node_modules/babel-preset-react-app/create.js:44-55,177-195`.
- **Impact:** PDF.js worker cannot start; fake-worker fallback also fails; viewer shows `ReaderError`.

### F2 — Confirmed: production PDF endpoint is healthy

- **Status:** Confirmed.
- **Evidence:** `GET https://zutsav.com/api/documents/privacy/view` → 200, `application/pdf`, 4,050,917 bytes, `%PDF-1.7`, `%%EOF`; parses to 2 pages with `pdfjs-dist@4.8.69`.
- **Code:** `backend/src/controllers/legalDocument.controller.js:50-65`; `backend/src/routes/legalDocument.routes.js:4-7`.

### F3 — Confirmed: production metadata is healthy

- **Status:** Confirmed.
- **Evidence:** `GET /api/documents/privacy` → 200, `exists: true`, `mimeType: application/pdf`, `viewUrl: /api/documents/privacy/view`.
- **Code:** `backend/src/controllers/legalDocument.controller.js:15-27,39-48`.

### F4 — Confirmed: local and production use different documents and worker assets

- **Status:** Confirmed.
- **Local:** `Corporate Privacy Policy.pdf`, 194,157 bytes, 3 pages, updated `2026-10-23T15:22:53.278Z`.
- **Production:** `Privacy Policy Content - Zutsav.pdf`, 4,050,917 bytes, 2 pages, updated `2026-10-17T09:17:27.952Z`.
- **Worker:** local `d5fd4ecd...` self-contained; production `0cd2aaab...` broken.
- **Implication:** local success cannot validate production.

### F5 — Confirmed: live `.mjs` MIME is correct

- **Status:** Confirmed.
- **Evidence:** Production worker response `Content-Type: application/javascript`.
- **Implication:** the earlier MIME issue is resolved for the deployed worker; MIME is not the current cause.

### F6 — Confirmed: worker/runtime version parity is correct

- **Status:** Confirmed.
- **Evidence:** runtime API `4.8.69`; worker `4.8.69`; installed `pdfjs-dist@4.8.69`.
- **Implication:** not a version mismatch.

### F7 — Confirmed: only one worker configuration, set before render

- **Status:** Confirmed.
- **Evidence:** only `frontend/src/pages/LegalDocumentViewerPage.jsx:13-16`; module-scope assignment; no other `GlobalWorkerOptions.workerSrc` in `frontend/src`.
- **Implication:** no competing component configuration.

### F8 — Probable: development browserslist explains local success

- **Status:** Probable (strong inference).
- **Evidence:** `frontend/package.json:41-48`; local worker has 0 imports; production worker has 11 helper imports; Babel absolute runtime config.
- **Implication:** local development does not exercise the failing production transform.

### F9 — Confirmed: production artifact is not the tracked build

- **Status:** Confirmed.
- **Evidence:** Production `main.10a452fa.js` / CSS `main.171e051d.css` / worker `0cd2aaab...`; tracked build `main.5cb31ad3.js` / CSS `main.b2b1a951.css` / worker `2b3c3870...`.
- **Implication:** deployment provenance is unclear; the tracked build is stale relative to production.

### F10 — Confirmed: tracked build reproduces the worker defect

- **Status:** Confirmed.
- **Evidence:** `frontend/build/static/media/pdf.worker.min.2b3c3870fffbf2e31837.mjs` contains 11 absolute `C:/Users/HP/.../node_modules/@babel/runtime/helpers/esm/` imports.
- **Implication:** a simple rebuild from the current tree will not fix production; the worker strategy must change first.

### F11 — Suspected risk: SPA fallback masks missing static assets

- **Status:** Suspected (configuration smell; not the observed cause).
- **Evidence:** Nonexistent paths and the old worker path return HTTP 200 `text/html`; missing `.mjs` would therefore look like a successful response.
- **Implication:** after remediation, ensure static asset misses return 404; do not let a missing worker return index.html.

### F12 — Unresolved: exact production build commit and browser console

- **Status:** Unresolved.
- **Evidence:** production artifacts are not present in the repository; no browser session was available.
- **Implication:** the root cause is proven from deployed artifacts and module tests, but the deployment source revision and exact browser error text remain unrecorded.

### F13 — Ruled out: authentication, document URL, missing file, corrupt bytes, MIME, CORS, CSP, version mismatch

- **Status:** Ruled out based on evidence.
- **Evidence:** public 200 metadata/PDF; valid PDF; correct MIME; same-origin; no CSP header; matching versions; PDF parses.
- **Caveat:** "ruled out" applies to the current observed production state, not to hypothetical future configurations.

---

## 12. Recommended minimal remediation

No code changes are made in this audit. The following is the proposed implementation plan.

### 12.1 Source change

Replace the `new URL(..., import.meta.url)` worker assignment in `frontend/src/pages/LegalDocumentViewerPage.jsx:13-16` with a URL pointing at a public, self-contained worker asset. Recommended form:

```js
pdfjs.GlobalWorkerOptions.workerSrc =
  `${process.env.PUBLIC_URL || ''}/pdf.worker-4.8.69.min.mjs`;
```

Why:

- CRA inlines `process.env.PUBLIC_URL`; at the domain root it is empty, yielding `/pdf.worker-4.8.69.min.mjs`.
- If the app is ever hosted under a subpath, `PUBLIC_URL` yields the correct prefix.
- The URL bypasses webpack/Babel processing of the worker entirely.
- The version in the filename makes worker/runtime drift visible and enables safe long-lived caching.

Do **not** copy the worker from `frontend/build/static/media/pdf.worker.min.2b3c3870fffbf2e31837.mjs` or from the deployed `/static/media/pdf.worker.min.0cd2aaabaa59731ff418.mjs`; those are the broken Babel-transformed artifacts. Copy from the installed package.

### 12.2 Public worker asset

Source file:

```text
frontend/node_modules/pdfjs-dist/build/pdf.worker.min.mjs
```

Verified properties:

- Size: 1,369,867 bytes.
- Version: `4.8.69`.
- ESM imports: 0.
- Node ESM import: succeeds and exports `WorkerMessageHandler`.

Destination:

```text
frontend/public/pdf.worker-4.8.69.min.mjs
```

The asset must be the unmodified package worker. After copying, verify:

- File starts with the PDF.js license header.
- No `import ` statements.
- No `/home/`, `node_modules`, `@babel/runtime`, or `C:/` strings.
- File size matches the installed package worker.
- The embedded version is `4.8.69`.

### 12.3 Make the copy deterministic

To avoid worker/runtime drift, add a small build/prebuild check that:

1. Reads `pdfjs-dist/package.json` version.
2. Copies `pdfjs-dist/build/pdf.worker.min.mjs` to `public/pdf.worker-<version>.min.mjs`.
3. Fails the build if the worker contains an `import` statement or an absolute filesystem path.
4. Optionally writes the expected filename/version into a generated constant used by the viewer.

A committed, versioned public worker plus a build assertion is the most deterministic option. A prebuild copy script is also acceptable, provided `npm ci`/`npm install` has completed before the build and the generated file is present in the deployed artifact.

Do not add a `postinstall` hook that depends on network access or modifies unrelated files. Keep the change scoped to the worker asset.

### 12.4 Nginx / deployment changes

No Nginx change is proven necessary for MIME, because the live server already serves `.mjs` as `application/javascript`. However:

1. If a repository-managed Nginx configuration is introduced, include an explicit MIME mapping for `.mjs` (for example `application/javascript mjs;`) rather than relying on the base image.
2. Ensure missing static assets return 404 instead of the SPA `index.html`. A missing `.mjs` served as `text/html` 200 is misleading.
3. Serve the versioned worker with an explicit cache policy:
   - Preferred: `Cache-Control: public, max-age=31536000, immutable` for the versioned filename.
   - Or: `Cache-Control: no-cache` / short max-age for an unversioned filename.
4. Do not add CORS headers for the worker; it is same-origin.
5. Do not add or broaden CSP unless separately justified; no CSP was observed and none is needed for this fix.
6. Purge Cloudflare cache for `index.html`, the main bundle, and the worker after deployment. Main JS currently has a 30-day cache lifetime.

### 12.5 Backend and data changes

**None required.** Do not modify the PDF upload, storage, metadata, or view controller. Do not re-upload or replace production documents. Do not change System Configuration or database records.

### 12.6 Why this is the smallest reliable fix

- It removes the worker from the CRA Babel/webpack transform path entirely.
- It uses the exact worker shipped with the installed `pdfjs-dist` version.
- It uses the worker that was verified self-contained and importable.
- It avoids ejecting CRA, adding a custom webpack config, or adding a worker loader.
- It keeps the existing PDF endpoint, viewer component, metadata flow, and DOC/DOCX fallback unchanged.

### 12.7 Alternatives considered

| Alternative | Assessment |
|---|---|
| Keep `new URL(...)` and change Babel config | Requires ejecting/craco/custom webpack; more invasive and risks the working local setup. Not minimal. |
| Use a CDN-hosted `pdf.worker.min.mjs` | Avoids packaging but introduces an external dependency, CSP/CORS/availability concerns, and version drift risk. Not recommended for this app. |
| Use a Blob URL created from raw worker text | Requires a raw-text loader/import mechanism not currently configured in CRA; more custom build work. |
| Run PDF.js without a worker | PDF.js may fall back to main-thread parsing, but this degrades responsiveness and the current library fallback still imports the broken worker first. Not a reliable fix. |
| Copy the existing `build/static/media` worker | Incorrect; that artifact is the broken Babel-transformed file. |

---

## 13. Build, browser, and staging verification plan

### 13.1 Pre-build checks

1. Confirm installed versions:
   - `react-pdf@9.2.1`
   - `pdfjs-dist@4.8.69`
   - Worker filename/version matches `pdfjs-dist` exactly.
2. Verify the public worker:
   - Size equals `node_modules/pdfjs-dist/build/pdf.worker.min.mjs`.
   - No `import` statements.
   - No `/home/`, `C:/`, `node_modules`, or `@babel/runtime` strings.
   - Node ESM import succeeds.
3. Run the source change in an isolated worktree/copy. Do not overwrite `frontend/build` or the production deployment directory during validation.
4. Run a production build with the production environment:
   - Use `npm ci` where possible for lockfile fidelity.
   - Ensure `REACT_APP_API_URL=https://zutsav.com/api` and other production values are present.
   - Confirm the build output contains `pdf.worker-4.8.69.min.mjs` at the site root (from `public/`).
   - Confirm the main bundle references `/pdf.worker-4.8.69.min.mjs` (or the `PUBLIC_URL`-prefixed equivalent).
   - Confirm no absolute `@babel/runtime` paths exist in the new worker.

### 13.2 Browser verification (staging first)

Use a staging domain with the same build and production-like headers. In browser DevTools:

1. Open the legal Privacy Policy page via a cold load and hard reload.
2. Network:
   - Metadata `GET /api/documents/<type>` → 200 JSON.
   - PDF `GET /api/documents/<type>/view` → 200 `application/pdf`.
   - Worker `GET /pdf.worker-4.8.69.min.mjs` → 200 `application/javascript`.
   - **No requests to `/home/...`, `/node_modules/...`, or `@babel/runtime` paths.**
   - Worker response body starts with the PDF.js license and contains no `import` statements.
3. Console:
   - No worker load/import errors.
   - No `Setting up fake worker failed` error.
   - No PDF.js API version mismatch.
4. Rendering:
   - PDF pages render (production document currently 2 pages).
   - Page count and page content match the configured document.
   - Retry button is not shown in the healthy state.
5. Repeat with cache disabled and after a normal reload.
6. Repeat in Chrome, Firefox, and Safari (desktop and at least one mobile browser) if available.
7. Open a DOC/DOCX legal document to confirm the Google viewer fallback still works.
8. Test a missing/invalid document type to confirm the existing `NotFound`/error states still behave.

### 13.3 HTTP/module checks for the operator

```powershell
# Metadata
Invoke-WebRequest -Uri 'https://<staging-host>/api/documents/privacy' -UseBasicParsing

# PDF headers and magic
Invoke-WebRequest -Uri 'https://<staging-host>/api/documents/privacy/view' -UseBasicParsing -OutFile "$env:TEMP\privacy.pdf" -PassThru

# Worker headers
Invoke-WebRequest -Uri 'https://<staging-host>/pdf.worker-4.8.69.min.mjs' -UseBasicParsing -Method Head

# Download worker and assert no imports
Invoke-WebRequest -Uri 'https://<staging-host>/pdf.worker-4.8.69.min.mjs' -UseBasicParsing -OutFile "$env:TEMP\pdf.worker.mjs"
Select-String -Path "$env:TEMP\pdf.worker.mjs" -Pattern '^\s*import\s'
Select-String -Path "$env:TEMP\pdf.worker.mjs" -Pattern '/home/|node_modules|@babel/runtime|C:/'
```

Expected:

- Worker status 200.
- `Content-Type: application/javascript`.
- No import matches.
- No absolute path matches.
- PDF magic `%PDF-`.

### 13.4 Regression tests to add

There is currently no frontend `test` script in `frontend/package.json` (only `start` and `build`), so do not assume a test framework. At minimum:

1. **Build assertion (Node script):**
   - Worker exists at the expected public path.
   - Worker size/version matches installed `pdfjs-dist`.
   - Worker contains no `import`, `/home/`, `node_modules`, `@babel/runtime`, or `C:/`.
   - Main bundle references the expected worker URL.
2. **Build artifact assertion:**
   - No emitted worker under `static/media/` contains absolute `@babel/runtime` imports.
3. **Browser smoke test:** the §13.2 checklist, run in staging and production after cutover.
4. **Document regression:** verify at least one PDF and one DOC/DOCX legal document, plus a document-replace operation in a non-production environment if possible.

Do not modify production documents or System Configuration as part of testing this frontend fix.

---

## 14. Rollback plan

1. Before deployment, preserve:
   - The current production frontend artifact/container image.
   - The current deployed main bundle hash (`main.10a452fa.js` observed).
   - The current worker URL/hash (`pdf.worker.min.0cd2aaabaa59731ff418.mjs` observed).
   - The current `index.html` and asset manifest, if available from the deployment system.
2. Deploy the new frontend artifact to a new directory/container/image rather than overwriting the only production copy.
3. If the new build fails verification:
   - Switch the production server back to the previous frontend artifact.
   - Purge Cloudflare cache for `index.html`, the main JS, and the worker path.
   - Verify the old page still loads and the old worker URL resolves as before.
4. Because this fix is frontend-only and does not change backend data or uploaded PDFs, rollback does not require database restoration.
5. If the new worker is versioned (`pdf.worker-4.8.69.min.mjs`), rollback does not need to remove it; the old build does not reference it. Leaving it is harmless.
6. If an unversioned worker is used instead, rollback must restore the previous worker file as well as the previous build, and cache purging is mandatory.

---

## 15. Tests and checks actually performed

This audit was read-only. The following checks were performed.

### Repository preservation

- `git status --porcelain=v1 -b`: branch `main`, tracking `origin/main`.
- Pre-existing changes: 24 modified tracked files and 10 untracked paths were present before the audit; none were reset, staged, committed, or overwritten.
- `git diff --stat` and `git diff --cached --stat`: no staged changes; only pre-existing unstaged work.
- `git log --oneline -15`: current HEAD `7bf6ee1`.
- `git ls-files frontend/build`: 13 tracked build files; a build would modify tracked artifacts, so no build was run.
- `git diff --stat -- frontend/build`: no changes from this audit.
- `frontend/public/`: only `favicon.svg` and `index.html`; no existing worker asset.

### Source and configuration inspection

- Read the Legal viewer, route, API config, axios config, admin legal documents UI, backend routes/controllers/model/upload middleware, app static handling, Dockerfile, package manifests/lockfile, CRA webpack config, Babel preset config, and PDF.js worker initialization code.
- Verified installed versions from `node_modules` and `package-lock.json`.
- Searched for all `GlobalWorkerOptions.workerSrc` / `react-pdf` / `pdfjs` occurrences in `frontend/src`.
- Inspected the tracked build worker and production worker bytes with regex searches for `import`, `from`, `/home/`, `node_modules`, `@babel/runtime`, `C:/`, and `WorkerMessageHandler`.

### Live production checks (read-only, no credentials)

- `GET https://zutsav.com/legal/privacy` → 200 HTML shell.
- `GET https://zutsav.com/api/documents/privacy` → 200 JSON metadata.
- `GET https://zutsav.com/api/documents/privacy/view` → 200 PDF, 4,050,917 bytes, valid header/trailer.
- `GET https://zutsav.com/static/js/main.10a452fa.js` → 200 JS; extracted worker URL.
- `GET https://zutsav.com/static/media/pdf.worker.min.0cd2aaabaa59731ff418.mjs` → 200 JS; extracted 11 absolute imports.
- `GET`/`HEAD` representative `/home/appuser/.../arrayLikeToArray.js` → 404.
- `HEAD` of page, main JS, worker for status/MIME/cache headers.
- `HEAD` of a nonexistent path and the old tracked worker path → 200 `text/html` (SPA fallback observation).
- No cookies, bearer tokens, or authorization headers were used or recorded.

### Local checks

- `GET http://localhost:3000/` → 200 CRA shell.
- `GET http://127.0.0.1:3000/static/js/bundle.js` → 200 dev bundle; confirmed current viewer source and worker URL.
- `GET http://127.0.0.1:3000/static/media/pdf.worker.min.d5fd4ecd74ea75c58c83.mjs` → 200; worker has 0 imports.
- `GET http://localhost:5000/api/documents/privacy` → 200 metadata for `Corporate Privacy Policy.pdf`.
- `GET http://localhost:5000/api/documents/privacy/view` → 200 PDF, 194,157 bytes.
- Direct `GET http://localhost:3000/legal/privacy` → 404; `https://localhost:3000/legal/privacy` failed at the connection layer. This is a local routing/protocol discrepancy, not the production root cause.
- No local browser rendering session was automated or captured.

### Executable tests

- Parsed the production PDF with installed `pdfjs-dist@4.8.69` legacy build in Node: 2 pages, fingerprint `9b3e62edbb532142985e63c0a0ddf7c5`.
- Parsed the local PDF: 3 pages, fingerprint `fb2be6d737dae6a797d6efa832cd2306`.
- Imported the production worker with Node ESM: failed on missing absolute `@babel/runtime` helper.
- Imported the local dev worker with Node ESM: succeeded.
- Imported the raw installed package worker with Node ESM: succeeded.

These Node tests are module-resolution/PDF-parsing tests, not browser reproductions. They were run against temporary copies outside the repository.

### Not performed

- No production deployment, file replacement, database change, or configuration change.
- No `npm run build` (would overwrite tracked `frontend/build`).
- No browser DevTools session; no real browser console/network trace.
- No Nginx configuration read from the live server.
- No client-side cache or Cloudflare purge tests.
- No commit.

---

## 16. Limitations and residual risk

1. **No browser-level reproduction.** The worker dependency failure is proven by live HTTP 404s and a Node ESM import failure, and explained by PDF.js source. A DevTools console/network capture was not available. The exact browser error text is therefore unrecorded.
2. **Production build provenance is unknown.** The deployed build differs from the tracked build. The fix must be applied to the actual deployment source, not just the local tree.
3. **Nginx state is observed, not inspected.** The repository has no Nginx config. Live headers show correct `.mjs` MIME, but the server configuration itself was not read.
4. **Local environment discrepancy.** The local direct URL/protocol differs from the client's report: actual HTTP, direct deep link returned 404. Local rendering was not independently browser-verified.
5. **Cache behavior is not fully known.** Main JS has a 30-day Cloudflare cache; the worker has no cache header currently. After the fix, an unversioned public worker could be cached and become stale if the runtime is upgraded. Use a versioned filename or a deliberate cache policy.
6. **Worker/runtime drift risk.** The public worker must be updated whenever `pdfjs-dist` is upgraded. A build-time copy/version check is therefore part of the recommended fix, not optional long-term hygiene.
7. **Static fallback risk.** Missing assets currently return HTTP 200 HTML. If the new worker URL is wrong or not deployed, the failure could be masked by a 200 response with HTML content. The operator should verify the worker response body, not just the status code.
8. **PDF rendering beyond the worker.** The production PDF parses successfully in Node. Other browser-specific rendering issues (fonts, canvas, memory, CSP, extensions, client cache) could theoretically surface after the worker is fixed, but there is no evidence of them now. The worker is the proven blocker.
9. **Security.** No secrets, cookies, bearer tokens, or private customer data were accessed or included in this report. Production document metadata is limited to the public fields returned by the public endpoint.

---

## Appendix A — Key evidence excerpts

### A.1 Deployed worker first imports

```text
/*! For license information please see pdf.worker.min.0cd2aaabaa59731ff418.mjs.LICENSE.txt */
import A from"/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/arrayLikeToArray.js";
import e from"/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/toArray.js";
import t from"/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/classPrivateFieldSet2.js";
...
```

### A.2 Representative HTTP result

```text
URL=https://zutsav.com/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/arrayLikeToArray.js
STATUS=404
CT=text/html
```

### A.3 Module-resolution results

```text
PROD_WORKER_IMPORT=FAIL
Cannot find module 'C:\home\appuser\apps\zpe-v14\frontend\node_modules\@babel\runtime\helpers\esm\arrayLikeToArray.js'
imported from C:\Users\HP\AppData\Local\Temp\opencode\prod-worker.mjs

LOCAL_WORKER_IMPORT=OK true
PACKAGE_WORKER_IMPORT=OK true
```

### A.4 PDF parse results

```text
PROD numPages= 2 fingerprint= 9b3e62edbb532142985e63c0a0ddf7c5
LOCAL numPages= 3 fingerprint= fb2be6d737dae6a797d6efa832cd2306
```

### A.5 Production worker metadata

```text
URL: https://zutsav.com/static/media/pdf.worker.min.0cd2aaabaa59731ff418.mjs
STATUS=200
CT=application/javascript
BYTES=1339522
CF-Cache-Status=DYNAMIC
Cache-Control=(none)
```

### A.6 Local dev worker metadata

```text
URL: http://localhost:3000/static/media/pdf.worker.min.d5fd4ecd74ea75c58c83.mjs
STATUS=200
CT=application/javascript; charset=utf-8
BYTES=1812734
ESM imports=0
```

---

## Appendix B — Repository state preserved

At audit start, the working tree already contained unrelated uncommitted work, including:

- Modified backend invoice/settings/inventory files.
- Modified frontend sidebar, invoice page, admin dashboard, and i18n locale files.
- Untracked manual-billing implementation and documentation files.

These were preserved. No reset, checkout, clean, stash, stage, commit, or overwrite was performed. `frontend/build/` was not rebuilt. The only repository file created by this audit is this report.
