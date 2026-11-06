# Footer Link — HTML Upload Restriction Audit

- **Date:** 2026-10-29
- **Scope:** Admin → System Configuration → Frontend → *Custom Footer Links* → **Add Footer Link** → **Upload Document**
- **Type:** Read-only audit. No source, config, dependency or data was changed.
- **Branch / tree at start:** `main`, working tree clean (`git status --short` printed nothing).

Legend: **[Confirmed]** = read directly in code in this audit. **[Inferred]** = follows from code but was not executed. **[Unverified]** = could not be checked from the repository.

---

## A. Executive summary

**The rejection is deliberate, not a bug.** `.html`, `.htm`, `.xhtml`, `.shtml`, `.mht`, `.mhtml` (and `.chm`) are in an explicit blocklist, and the exact message *"Web pages cannot be uploaded — use "Attach URL" for web pages"* is produced when the file name contains one of the web-page extensions. **[Confirmed]**

- The restriction is enforced in **both** layers:
  - Frontend — checked before any request is sent, so for `index.html` the browser never contacts the server (`frontend/src/utils/footerLinks.js:103-104`, message at `:34`).
  - Backend — checked again at the multer file filter and again in the controller (`backend/src/middleware/upload.js:92-96`, `backend/src/utils/footerLinks.js:102-116`, `:184-186`).
- Removing it from one side alone would not help; the other side would still reject the file.
- Even if both checks were removed, **the file would still not work as a web page**. Uploaded files are stored outside the web root, and the only public route for them delivers everything except PDF/PNG/JPEG/GIF/WebP as a forced download with a sandboxing CSP (`backend/src/controllers/footerLinks.controller.js:299-321`). An `index.html` would download, not render. **[Confirmed]**
- The design was intentional: the file-policy comment says web pages are refused so uploaded content "is never rendered (or executed) in the site's context" (`footerLinks.js:69-81`, `footerLinks.controller.js:308-311`).

**Recommendation (details in §G/§H):** do **not** enable HTML upload on the existing origin. Host the page elsewhere and use **Attach URL** (Option A) — zero code change, already supported. If the content is meant to be a permanent part of the Zutsav site, make it a normal React route/page (Option B). Use PDF (Option D) if visitors only need to read it. Build isolated static-site publishing (Option C) only if the owner genuinely needs to upload arbitrary web pages repeatedly.

---

## B. Frontend validation and upload flow

| Step | Location | Notes |
|---|---|---|
| Form UI, two radio buttons "Attach URL" / "Upload Document" | `frontend/src/components/admin/CustomFooterLinksSection.jsx:102-109` | |
| File input | `CustomFooterLinksSection.jsx:122-123` | `<input type="file">` has **no `accept` attribute**, so the OS picker offers every file type; rejection only happens after selection/submit. |
| Helper text under the input | `:131-135` | Already says "…macro-enabled Office files and web pages are not allowed." |
| Submit → validation | `:41-46` calls `validateFooterLinkForm(form, existing)`; if any error, returns **before** building the request | This is where `index.html` stops. |
| Validator | `frontend/src/utils/footerLinks.js:84-112`; file branch `:103-110` | Order of file checks: blocked name → >10 MB → empty. |
| Blocklist | `footerLinks.js:13-21` (`html`, `htm`, `xhtml`, `shtml`, `mht`, `mhtml`, `chm` at `:20`) | Mirrors the backend list. |
| Message source | `footerLinks.js:26-36`; web-page branch `:33-35` | Uses typographic quotes (“Attach URL”). The backend uses straight quotes. |
| Error display | `Field` renders `errors.file` as `role="alert"` (`CustomFooterLinksSection.jsx:15-23`, used at `:118`) | This is the text the owner saw. |
| Request (only reached for allowed files) | `:51-65` — multipart `FormData` (`label`, `linkType`, `enabled`, `file`) → `POST /admin/footer-links` or `PATCH /admin/footer-links/:id`; upload progress at `:60-62` | |
| Server error handling | `:68-70` — `toast.error(err.response.data.message)` | If a server-side reject ever occurred, its message is shown as a toast. |
| Public rendering of the link | `frontend/src/components/layout/Footer.jsx:113-134`: URL links → `<a target="_blank" rel="noopener noreferrer">`; document links → React Router `<Link to="/legal/link/:id">` | |
| Document viewer | `frontend/src/pages/LegalDocumentViewerPage.jsx:130-137`, `:180-202` | PDF → pdf.js canvas; image → `<img>`; anything else → Download card. There is no iframe/HTML rendering path for custom files. |
| Route | `frontend/src/App.jsx:117` `/legal/link/:linkId` | |

Tests that lock the current behavior: `frontend/src/utils/footerLinks.test.js:89` and `:109` (`index.html` → `/Attach URL/`).

---

## C. Backend validation and file-storage behavior

### Routes
- Admin: `backend/src/routes/footerLinksAdmin.routes.js:11-22` — `POST /` and `PATCH /:id` go through `uploadFooterFile.single('file')`. Mounted under `/api/admin/footer-links` behind `protect, authorize('admin')` (comment `:5-6`; mount at `backend/src/routes/admin.routes.js:27`). **[Confirmed for mount; the `protect/authorize` middleware itself was not re-read.]**
- Public (no auth): `backend/src/routes/footerLinks.routes.js:6-8` — `GET /:id` (metadata), `/:id/view`, `/:id/download`. Mounted at `backend/src/app.js:184`.

### Layers of validation (in the order a request meets them)
1. **Multer file filter** — `backend/src/middleware/upload.js:92-96` calls `blockedNameReason(file.originalname)`; a non-empty reason becomes a 400 with the same message (`footerLinksAdmin.routes.js:12-14`).
2. **Size limit** — 10 MB (`MAX_FILE_SIZE`, `footerLinks.js:83`; multer `limits` `upload.js:97-103`, `files: 1`).
3. **Controller → `buildDocument`** (`footerLinks.controller.js:81-92`) → **`inspectUpload`** (`footerLinks.js:184-203`):
   - re-runs the name check (`:185-186`) — this is the second backend enforcement of the HTML rule;
   - rejects empty files, >10 MB, and disguised executables by magic bytes (ELF, Mach-O, Java class, `#!`, PE) (`:165-177`, `:188-191`);
   - for the 22 known extensions, the real bytes must match the extension (`:196-201`).
4. **Name rule detail** — every dot-separated segment is checked (`footerLinks.js:107-109`), so `a.html.txt` and `x.html.pdf` are also rejected. **[Confirmed; covered by tests `footer-links.test.js:611-614`.]**

### Storage
- Files land in `backend/uploads/legaldocs/` under a server-generated name `<timestamp>-<random><known-ext or .bin>` (`upload.js:82-91`, `footerLinks.js:159-160`). The original name is kept only as metadata (`footerLinks.controller.js:83-84`).
- Metadata lives in `SystemSettings.footerLinks[].document` (`backend/src/models/SystemSettings.js:27-44`); the storage path is never sent to clients (`toAdminLink`, `footerLinks.js:259-279`).
- `/uploads/legaldocs` is **explicitly blocked from direct HTTP access** with a 403 (`app.js:148-150`), placed before the generic `express.static('/uploads')` (`app.js:151`). So no stored footer file is reachable by its disk path. **[Confirmed]**

### Public delivery (`sendLinkFile`, `footerLinks.controller.js:299-321`)
- `inline` only if the stored MIME ∈ `INLINE_MIMES` = PDF, PNG, JPEG, GIF, WebP (`footerLinks.js:150`, `controller:312`).
- Everything else: `Content-Disposition: attachment`, plus `Content-Security-Policy: default-src 'none'; sandbox` (`controller:314-317`); always `X-Content-Type-Options: nosniff` (`:315`).
- The MIME type is derived server-side from the verified extension, never from the browser (`footerLinks.js:202`).

### Inconsistencies noticed (non-blocking, worth fixing in the same later change)
- `footerLinks.controller.js:139` and `:201` say *"Choose a PDF, DOC, or DOCX file to upload"*, and the `SystemSettings.js:22-23` comment says "uploaded PDF/DOC/DOCX", but the actual policy accepts almost any non-executable file (`upload.js:75-80`). The message is stale.
- The file input has no `accept` hint (see §B).

---

## D. Supported and unsupported formats

| Category | Status | Evidence |
|---|---|---|
| PDF | ✅ Opens inline in a pdf.js viewer | `KNOWN_TYPES.pdf` `footerLinks.js:125`; viewer `LegalDocumentViewerPage.jsx:217-243` |
| PNG, JPG/JPEG, GIF, WebP | ✅ Shown inline as an image | `:126-130` |
| BMP, SVG, TXT, CSV, RTF | ✅ Accepted, **download only** (SVG deliberately not inline: "can carry scripts") | `:131-135` |
| DOC/DOCX, XLS/XLSX, PPT/PPTX, ODT/ODS/ODP | ✅ Accepted, download only; content signature verified | `:136-144` |
| ZIP, GZ, 7Z, RAR | ✅ Accepted, **download only — never unpacked or served** | `:145-148` |
| Other unknown extensions (e.g. `.dwg`) | ✅ Accepted as `application/octet-stream`, stored as `.bin`, download only | `:194`; test `footer-links.test.js:558,572` |
| **HTML / HTM / XHTML / SHTML / MHT / MHTML / CHM** | ❌ Refused (frontend + backend) | `footerLinks.js:96,98`; frontend `:20,22` |
| Executables/installers/scripts (`.exe .js .php .py .sh …`), macro Office (`.docm .xlsm …`) | ❌ Refused | `footerLinks.js:85-94` |
| Special names `.htaccess`, `.htpasswd`, `web.config`, `.user.ini` | ❌ Refused | `:99` |

Use-case mapping (task §2):

| Use case | Supported today? |
|---|---|
| 1. PDF / document for visitors to open or download | **Yes** (Upload Document) |
| 2. Link to an already-hosted web page | **Yes** (Attach URL; `validateUrl` `footerLinks.js:42-59`, http/https only, no credentials; opens in new tab with `noopener noreferrer`, `Footer.jsx:116-120`) |
| 3. Upload a standalone HTML file and publish it as a browser-viewable page | **No** — blocked by design and no route can render it |
| 4. Upload a full static site (HTML+CSS+JS+images+fonts) | **No** — a ZIP can be uploaded but is only offered as a download; there is no unzip, no multi-file hosting, no relative-asset routing |

---

## E. Security assessment of allowing HTML upload

### Why a naive change is unsafe on this codebase
1. **Same-origin script execution.** Uploaded HTML can contain `<script>`. If it were served from the origin that also hosts the site/API, that script runs with that origin's privileges. The public file route is `GET /api/footer-links/:id/view` on the API server (`footerLinks.controller.js:323`). **[Confirmed]**
2. **Auth tokens are readable by script.** The web app stores the JWT in `localStorage`/`sessionStorage` under `zutsav_token` (`frontend/src/utils/authStorage.js:7-23`, `readToken` `:24-26`). Any script running on the **frontend's origin** can read it. **[Confirmed]**
3. **Whether API and SPA share an origin in production is [Unverified].** Dev uses different ports (`localhost:3000` SPA vs `localhost:5000` API, `.env.example`), and browser storage is port-scoped, so dev would not leak. But `frontend/Dockerfile:15` documents `REACT_APP_API_URL=https://zutsav.com/api` and there is no nginx config in the repo, which suggests a same-host deployment where `/api` is reverse-proxied. If so, an HTML file served from `/api/footer-links/:id/view` would be same-origin with the SPA and could steal an admin's token if the admin opened it (stored XSS → account takeover). This must be checked against the real server config before any design is chosen.
4. **Existing defenses are not sufficient to rely on:**
   - `helmet` is on with defaults (`app.js:31`), which gives the API a CSP, but (a) it is only on the Express app, (b) the SPA is served by stock `nginx:alpine` with no custom headers (`frontend/Dockerfile:36-41`; no `nginx.conf` or CSP `<meta>` in `frontend/public/index.html` — **[Confirmed absence in repo]**), and (c) helmet's default `script-src 'self'` still permits same-origin `<script src>` files.
   - The only HTML sanitizer in the repo is a four-regex blacklist (`backend/src/utils/sanitizeHtml.js:4-10`). The earlier `release-audit/CRITICAL_FINDINGS.md:90` already records a confirmed bypass and the stored-XSS→token-theft chain. It must not be reused for whole-document HTML; there is no `sanitize-html`/DOMPurify dependency (`backend/package.json`, `frontend/package.json` grep returned only `helmet`).
5. **Content-sniffing/polyglots.** Today the magic-byte check + `nosniff` + sandbox CSP + attachment disposition are what make the current "download anything" policy safe; HTML is exactly the type that defeats these (the test `footer-links.test.js:258` deliberately uploads `<html><script>…` as `page.pdf` and expects rejection).
6. **Phishing / content spoofing.** Even without script access, a page on the company's own domain can host a fake login form. Admin-only upload lowers but does not remove this (compromised or careless admin).
7. **Mobile app impact.** The mobile app only accepts footer file paths matching `/api/footer-links/:id/(view|download)` and `/api/documents/:type/view` (`mobile-app/src/utils/legalResources.js:121-130`); an HTML type would need new handling there too. **[Confirmed in code; mobile behavior not run.]**

### What already protects uploads today (keep it)
Extension blocklist on both sides; magic-byte verification; server-chosen MIME and file name; raw path 403 (`app.js:148`); inline whitelist; `nosniff`; sandbox CSP on attachments; 10 MB cap; 20-link cap; audit logging (`footerLinks.controller.js:94-101`); atomic writes and orphan cleanup.

### Verdict
Adding `html` to an allowlist, or deleting the rejection, **would not be safe** and **would not work** (the file would still download). A safe HTML feature needs origin isolation (§G, Option C).

---

## F. Does the supplied `index.html` need additional assets?

**[Unverified]** — the owner's file is not in the repository (the only `index.html` files found are `frontend/public/index.html`, the CRA template, and copies under `node_modules` and `.claude/worktrees/`; none is the owner's). It was therefore not inspected, and I have not assumed it is self-contained.

How to check in 1 minute (owner or implementer): open the file in a text editor and search for `<link`, `<script src`, `<img src`, `url(`, `@import`, `fetch(`/`XMLHttpRequest`, and `<iframe`. Then classify:

| What you find | Consequence |
|---|---|
| Only inline `<style>`/`<script>`, `data:` images, absolute `https://` CDN links | Self-contained enough to host as one file (Attach URL on any static host works). |
| Relative references like `css/style.css`, `./app.js`, `images/logo.png` | A single-file upload would render broken (unstyled/missing images) even if allowed; the whole folder must be hosted together. |
| Calls to APIs / forms posting somewhere | Needs a backend or CORS; not solved by uploading the file. |
| Any `<script>` at all | Treated as executable; relevant to the security design. |

---

## G. Comparison of options

| | **A. Attach URL** | **B. Normal website page** | **C. Secure static HTML publishing** | **D. PDF / documents only** |
|---|---|---|---|---|
| Works for owner's `index.html` today | **Yes** if the page is hosted somewhere public | Yes, after developer work | Yes, after substantial new feature | Only if the content can be read statically |
| Code change | **None** | Frontend route/component (+ redeploy) | Backend + frontend + infra + new dependency | None |
| Security risk to Zutsav origin | None (opens other site in new tab, `noopener noreferrer`) | Low (reviewed code, no user-supplied HTML) | Medium–high unless fully isolated | Low (already hardened) |
| Interactivity (JS, forms) | Whatever the external host serves | Full, as React code | Possible but must be sandboxed | None |
| Assets (CSS/JS/images) | Host the whole folder | Bundled by build | Needs multi-file upload/unzip | Embedded in the PDF |
| Mobile app | Opens URL | Needs a mobile route or in-app browser | Needs handling | Already supported |
| Ongoing owner effort | Host + keep URL alive | Developer for each change | Self-service for admin | Self-service |
| Existing support | `validateUrl` `footerLinks.js:42-59`; Footer `:115-124` | React routes exist (`App.jsx`, e.g. `/legal/*`, `/blog/*`) but **no generic CMS/"static page" model exists** (no such model in `backend/src/models`) | None (no zip library in either `package.json`) | Yes (PDF inline viewer) |

### Option A — Attach URL **[Confirmed supported]**
Requires the page to be hosted at a public `http(s)` URL (any static host: GitHub Pages, Netlify, Cloudflare Pages, S3/CloudFront, or a dedicated sub-site on the company's own server). If `index.html` has relative CSS/JS/images, upload the whole folder there. Footer then shows the label and opens the URL in a new tab. No security exposure to the Zutsav origin. Caveats: the owner must keep the external host alive; the page is not covered by Zutsav's backups/audit trail; a URL change requires editing the link.

### Option B — Make it a real website page **[Inferred]**
If the content is stable "company information" (like About/Policy), add it as a React page, e.g. a route in `frontend/src/App.jsx` next to `/legal/:type` (`App.jsx:117-118`), then add its URL (`https://<site>/<route>`) via **Attach URL**. This avoids arbitrary HTML uploads entirely. Note that `BlogDetailPage.jsx:763` renders stored HTML via `dangerouslySetInnerHTML` behind the weak sanitizer, so posting the content as a blog post is **not** recommended as a workaround for untrusted/complex HTML (the blog write route is permission-gated, `blog.routes.js:29-33`, but is not admin-only by default).

### Option C — Secure static HTML publishing **[Not implemented; design requirements]**
Only if repeated self-service HTML publishing is a genuine requirement. Minimum safe design:
1. **Separate origin.** Serve published sites from a different registrable domain (e.g. `zutsav-pages.example`) via a separate vhost/bucket/CDN, with **no** cookies, no CORS credentials and no access to `zutsav.com` storage. Not `zutsav.com/…` and not a path on the API.
2. **Upload as a ZIP** containing `index.html` + assets; extract server-side with: zip-slip (path traversal) protection, entry-count and total-uncompressed-size caps (zip-bomb), symlink rejection, extension allowlist for assets (`html css js json png jpg jpeg gif webp svg ico woff woff2 txt`), reject executables/server-side types, content-type forced by server by extension.
3. **Strict response headers** on the isolated origin: `Content-Security-Policy` (at minimum `default-src 'self'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'`, and consider `sandbox` without `allow-same-origin`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.
4. **Storage:** an isolated folder per link id (random, unguessable), removed when the link is deleted/replaced (reuse `releaseFile` pattern, `footerLinks.controller.js:54-59`).
5. **Data model:** a third `linkType` (e.g. `site`) so the footer renders it as an external link (new tab, `noopener noreferrer`) to the isolated origin — never through the SPA's `<Link>`/iframe.
6. **Scripts policy decision:** either forbid `<script>` (strongest: sanitize with a vetted library such as DOMPurify/`sanitize-html`, **not** `sanitizeHtml.js`) or allow scripts only on the isolated origin.
7. **Controls:** admin-only, size/count limits, audit log entry, rate limiting on the public route, mobile-app handling, and an operational decision on who is liable for the content.
8. **Requires approval:** a zip-extraction library and (if sanitizing) a sanitizer — both are new dependencies, which this task forbids.

### Option D — PDF / documents only **[Confirmed supported]**
If visitors only need to read the content (terms, brochure, notice, price list), print/convert `index.html` to PDF and upload it. It is rendered inline in the Zutsav-branded viewer (`LegalDocumentViewerPage.jsx:217-243`) with no HTML-injection risk. Limitations: no interactivity, no responsive reflow on small screens, links inside the PDF depend on the viewer.

---

## H. Recommended approach and files for a later task

**Recommendation (safest option that satisfies the likely intent):**
1. **Now, no code:** host the page (and its folder, if it has relative assets) on a public static host and add it with **Attach URL**.
2. If it is permanent company content, ask a developer to implement it as a normal site page (Option B) and attach that URL.
3. If it is a read-only document, upload a PDF (Option D).
4. Choose Option C only after the owner answers the questions in §J.

### Files that would change if the owner approves each follow-up

*Small usability fixes (safe, independent of the decision):*
- `frontend/src/components/admin/CustomFooterLinksSection.jsx:131-135` — make helper text point to Attach URL for web pages and mention the PDF alternative; optionally add `accept` hint to the input (`:122`) while keeping validation.
- `backend/src/controllers/footerLinks.controller.js:139,201` — fix stale message "Choose a PDF, DOC, or DOCX file".
- `backend/src/models/SystemSettings.js:22-23` — fix stale comment.

*Option B (site page):* `frontend/src/App.jsx` (new route, near `:117-118`), a new page component under `frontend/src/pages/`, optionally `frontend/src/components/layout/Footer.jsx` only if a fixed link is preferred. Plus i18n keys if translated. No backend change.

*Option C (isolated static publishing) — at minimum:*
- `backend/src/utils/footerLinks.js` (new `site` link type, allowlist, zip entry validation, `toPublicFooterLinks`/`toAdminLink`; keep `html` blocked for the *document* type)
- `backend/src/middleware/upload.js` (ZIP-specific multer config)
- `backend/src/controllers/footerLinks.controller.js` (create/update/delete/cleanup for sites)
- `backend/src/models/SystemSettings.js` (schema: `linkType` enum, site metadata)
- `backend/src/routes/footerLinksAdmin.routes.js` and, if the backend serves the sites, a *separate* app/vhost (not `app.js` on the main origin)
- `backend/src/routes/settings.routes.js` (public DTO)
- `backend/package.json` (zip lib; sanitizer if chosen) — **needs explicit approval**
- `frontend/src/utils/footerLinks.js` (type + validation mirror), `frontend/src/components/admin/CustomFooterLinksSection.jsx` (third option/UI), `frontend/src/components/layout/Footer.jsx` (render as external link)
- `mobile-app/src/utils/legalResources.js` (+ screens) if mobile must show it
- Infra: new domain/vhost/bucket and header config (outside the repo today); `docs/DEPLOYMENT_CONFIGURATION.md`

---

## I. Required regression tests and security checks (for any later implementation)

**Must keep passing (existing):** `backend/tests/footer-links.test.js` (name-block list incl. `page.html` `:611-620`, inline-only-PDF/images `:576-600`, SVG never inline `:602`, raw-path 403, magic-byte rejection `:645`); `frontend/src/utils/footerLinks.test.js` (`:89`, `:100-112`); `CustomFooterLinksSection.test.jsx`; `Footer.test.jsx`; `LegalDocumentViewerPage.test.jsx`.

**For the small-fix change:** assert `index.html` is still rejected on both sides; assert the revised helper/error text; assert URL links still open with `target="_blank" rel="noopener noreferrer"`.

**For Option C (additional):**
- ZIP: zip-slip (`../`, absolute paths, backslashes), symlinks, nested/duplicate names, zip bomb (size ratio), too many entries, missing `index.html`, disallowed extensions, double extensions, case variants, null bytes.
- Served headers on the isolated origin: CSP, `nosniff`, no `Set-Cookie`, correct `Content-Type` per extension, no directory listing, 404 for unknown paths, no access to the main origin's `localStorage`/cookies (manual browser check with a probe page that tries `window.parent`, `document.cookie`, `fetch('/api/…')`).
- Same-origin check: confirm sites are **not** reachable under the main site's host or `/api`.
- Link lifecycle: replace/delete removes files; disabled link returns 404; type switching cleans up.
- Authorization: only admin can upload; public route has rate limit; audit entries written.
- XSS fixtures: `<script>`, `onerror=`, `javascript:` (mixed case, entity-encoded), `<meta http-equiv=refresh>`, `<base>`, SVG with script, `<form action>` — verify behavior per the chosen scripts policy.
- Frontend: Footer renders `site` links only as external anchors; no `<iframe>` of uploaded content in the SPA.
- Mobile: link handling for the new type.
- Manual: real-device and browser checks, plus an independent security review.

---

## J. Remaining questions and blockers

1. **What is in the owner's `index.html`?** (Needs the file: relative CSS/JS/images? scripts? forms? external API calls?) — blocks the choice between A and C. **[Unverified]**
2. **Is the content a permanent part of the Zutsav site or a one-off/third-party page?** (B vs A.)
3. **Do visitors need interactivity, or only to read?** (D vs the rest.)
4. **Production topology:** are the SPA and `/api` served from the same hostname? Is there a real nginx/Apache/CDN config with security headers? Not in the repository. **[Unverified]** — decisive for how risky same-origin HTML would be.
5. **Who will upload HTML in future** (single trusted owner vs multiple admins), and how often? Determines whether Option C's cost is justified.
6. **Is approval available for new dependencies** (zip extraction, HTML sanitizer) and for a second domain/origin? Both are prerequisites for Option C.
7. **Mobile expectations:** should the footer item appear in the mobile app for a hosted web page?
8. Not executed in this audit: the test suites and the running app. Findings are from reading code; the claim "an HTML file would download rather than render even if the name check were removed" is **[Inferred]** from `sendLinkFile` and the `KNOWN_TYPES` logic (an `.html` extension is not in `KNOWN_TYPES`, so it would become `application/octet-stream` / `.bin`, `footerLinks.js:160,194`).

---

## K. Confirmation that no implementation code was changed

- No source, test, config, dependency, upload-allowlist, route, validation, storage or footer file was modified.
- No package was installed; no git add/commit/push/stage/deploy/publish was performed.
- `git status --short` was empty at the start and the only change is this new file, `docs/FOOTER_LINK_HTML_UPLOAD_AUDIT.md`.
- No credentials, tokens or personal data are included; the `.env` files were not opened (only `.env.example` values for dev ports were referenced).
