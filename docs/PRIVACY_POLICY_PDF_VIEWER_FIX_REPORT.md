# ZUTSAV — Privacy Policy PDF Viewer Production Fix

- **Date:** 2026-10-23
- **Scope:** Frontend PDF.js worker packaging only.
- **Audit:** `docs/PRIVACY_POLICY_PDF_VIEWER_AUDIT.md`
- **Status:** Implemented and verified in an isolated production build. Not deployed.
- **Production URL:** `https://zutsav.com/legal/privacy`

## 1. Summary

The production failure was caused by the CRA production build transforming `pdfjs-dist/build/pdf.worker.min.mjs` through Babel. The transformed worker contained absolute `@babel/runtime` imports pointing inside the production server's `node_modules`, which the browser could not load. PDF.js then failed its main-thread fallback for the same reason, and the viewer showed the generic load error.

The fix serves the **unmodified, self-contained** worker as a static public asset with a filename that matches the installed PDF.js version. The viewer resolves that asset using `pdfjs.version` and `process.env.PUBLIC_URL`. Build-time scripts generate the asset and verify that the production build copied it without transformation.

## 2. Root cause

Confirmed in the audit:

- Installed packages: `react-pdf@9.2.1`, `pdfjs-dist@4.8.69`, `react-scripts@5.0.1`.
- The package worker source is self-contained: `frontend/node_modules/pdfjs-dist/build/pdf.worker.min.mjs`, 1,369,805 bytes, no `import` statements, no `@babel/runtime` references.
- The previous viewer used `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)`, which made webpack emit the worker as a bundled asset.
- CRA's production Babel configuration transformed that emitted worker and injected absolute runtime helper imports under `/home/appuser/apps/zpe-v14/frontend/node_modules/@babel/runtime/helpers/esm/`.
- The production worker URL returned HTTP 200, so the failure was not a missing asset or MIME-type problem. The worker's imports returned 404 and prevented initialization.

## 3. Changes

### 3.1 Static worker preparation

Added `frontend/scripts/prepare-pdfjs-worker.js`.

The script:

1. Resolves `pdfjs-dist/package.json` and `pdfjs-dist/build/pdf.worker.min.mjs` from the installed frontend package.
2. Rejects an empty worker, a worker containing `@babel/runtime`, or a worker containing ESM `import` statements.
3. Copies the worker unchanged to `frontend/public/pdf.worker-<version>.min.mjs`.
4. Reports the source path, byte count, and SHA-256 digest.

Generated file for the current dependency:

```text
frontend/public/pdf.worker-4.8.69.min.mjs
bytes:  1,369,805
sha256: 8806d6a3b155fca69eb4b590629f760794fe3e21e82df102a39762d60eed53e1
```

### 3.2 Viewer worker URL

Updated `frontend/src/pages/LegalDocumentViewerPage.jsx`:

```js
const publicUrl = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
pdfjs.GlobalWorkerOptions.workerSrc = `${publicUrl}/pdf.worker-${pdfjs.version}.min.mjs`;
```

This keeps the worker filename synchronized with the runtime exported by `react-pdf`/`pdfjs-dist` and works with CRA's `PUBLIC_URL` deployment prefix. The worker is no longer part of the webpack module graph, so Babel cannot transform it.

### 3.3 Build verification

Added `frontend/scripts/verify-pdfjs-worker-build.js`.

The verifier fails the build check unless:

1. `public/pdf.worker-<version>.min.mjs` exists and exactly matches the installed package worker.
2. The production build contains the same worker at its root.
3. The built worker exactly matches the package source.
4. The built worker contains no `@babel/runtime` references and no `import` statements.
5. At least one production JavaScript bundle references `pdf.worker-`.

The verifier reads `BUILD_PATH` when set, so it can validate an isolated build:

```powershell
$env:BUILD_PATH = 'C:\path\to\isolated-build'
npm run build
npm run verify:pdfjs-worker
```

### 3.4 npm lifecycle scripts

Updated `frontend/package.json`:

```json
"prepare:pdfjs-worker": "node scripts/prepare-pdfjs-worker.js",
"prestart": "node scripts/prepare-pdfjs-worker.js",
"start": "react-scripts start",
"prebuild": "node scripts/prepare-pdfjs-worker.js",
"build": "react-scripts build",
"verify:pdfjs-worker": "node scripts/verify-pdfjs-worker-build.js"
```

`npm start` and `npm run build` regenerate the worker automatically. The verification command is separate and non-recursive.

### 3.5 Generated file ignore rule

Updated `frontend/.gitignore`:

```text
public/pdf.worker-*.min.mjs
```

Only generated versioned workers are ignored; the rest of `frontend/public/` remains tracked.

## 4. Verification

### 4.1 Package and source checks

- `react-pdf` exports `pdfjs.version === "4.8.69"`.
- Source worker byte count: 1,369,805.
- Source worker SHA-256: `8806d6a3b155fca69eb4b590629f760794fe3e21e82df102a39762d60eed53e1`.
- Source worker `@babel/runtime` matches: 0.
- Source worker import statements: 0.
- `node --check` passed for both new scripts.

### 4.2 Isolated production build

The build was run outside the repository so the tracked `frontend/build/` directory was not modified:

```text
C:\Users\HP\AppData\Local\Temp\opencode\zutsav-pdf-worker-build
```

`npm run build` completed successfully with pre-existing ESLint warnings and no build errors. The `prebuild` lifecycle regenerated the worker and reported it as up-to-date.

### 4.3 Built artifact checks

`npm run verify:pdfjs-worker` passed:

```text
verified ..\..\..\..\AppData\Local\Temp\opencode\zutsav-pdf-worker-build\pdf.worker-4.8.69.min.mjs
bytes=1369805 sha256=8806d6a3b155fca69eb4b590629f760794fe3e21e82df102a39762d60eed53e1
bundle references: main.37376920.js
```

Independent inspection of the built worker:

```text
builtBytes: 1,369,805
@babel/runtime references: 0
import statements: 0
```

Only one worker file exists in the build, at the application root. It is not emitted under `static/media/`.

### 4.4 Static HTTP check

A local static server was used to request the built worker at `/pdf.worker-4.8.69.min.mjs`:

```text
status:        200
content-type:  application/javascript
bytes:         1,369,805
sha256:        8806d6a3b155fca69eb4b590629f760794fe3e21e82df102a39762d60eed53e1
```

### 4.5 Repository safety checks

- `git diff --stat -- frontend/build` is empty; the 13 tracked build files were not changed.
- The generated public worker is correctly ignored by `frontend/.gitignore`.
- No backend, dependency, lockfile, database, or uploaded-document changes were made.
- Existing unrelated uncommitted changes were preserved.
- No commit or deployment was performed.

## 5. Deployment notes

1. Deploy only after the frontend is rebuilt with `npm run build` from `frontend/`. The `prebuild` script generates the versioned worker in `public/`, and CRA copies it to the build root.
2. The repository `frontend/Dockerfile` already runs `npm run build` at line 28, so its build stage will run `prebuild`; no Dockerfile change is required. Its Nginx stage copies the complete build to the web root, so the versioned worker is served at `/pdf.worker-4.8.69.min.mjs`.
3. Do not deploy the existing tracked `frontend/build/` directory as-is. It still represents the previous build and does not contain the new worker path. This task intentionally did not overwrite tracked build artifacts.
4. If the deployment pipeline invokes `react-scripts build` directly instead of `npm run build`, run `node scripts/prepare-pdfjs-worker.js` first or the worker will be missing.
5. The worker URL is `/pdf.worker-4.8.69.min.mjs` under the configured `PUBLIC_URL`. It must be served as JavaScript. Because the filename is versioned, it can safely be cached as immutable; no Nginx change was made in this task.
6. Keep `pdfjs-dist` and the generated worker version synchronized. Upgrading `pdfjs-dist` requires regenerating the worker through the normal build; the verifier will fail if the versioned asset is missing.

### Rollback

Revert the viewer, `package.json`, `.gitignore`, and the two scripts, then rebuild. The generated `frontend/public/pdf.worker-4.8.69.min.mjs` can be deleted. The prior behavior is restored by the previous build.

## 6. Limitations

No authenticated browser or browser automation session was available. Verification covers the production build artifact, worker self-containment, hash equality, static serving, and the bundle's worker reference. It does not include an in-browser render of the production PDF after deployment. The audit already confirmed that the production PDF itself parses correctly with `pdfjs-dist@4.8.69`.

## 7. Files changed

- `frontend/src/pages/LegalDocumentViewerPage.jsx`
- `frontend/package.json`
- `frontend/.gitignore`
- `frontend/scripts/prepare-pdfjs-worker.js` (new)
- `frontend/scripts/verify-pdfjs-worker-build.js` (new)
- `docs/PRIVACY_POLICY_PDF_VIEWER_FIX_REPORT.md` (this report)

Generated and ignored, not committed:

- `frontend/public/pdf.worker-4.8.69.min.mjs`
