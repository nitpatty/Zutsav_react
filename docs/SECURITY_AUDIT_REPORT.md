# Zutsav Security Audit Report

## 1. Executive Summary

This report documents a code-review and dependency-audit assessment of the Zutsav platform (Web, Backend, Mobile). The audit was documentation-only: no application code, configuration, database, or credentials were changed.

Key strengths observed:
- JWT-based auth with tokenVersion invalidation and admin session tracking.
- Role-based authorization middleware (`protect`, `authorize`).
- Coordinate-pair validation and desync guards for location data.
- Server-side HTML sanitization for rich-text fields.
- KYC/govt-ID documents are not served as static files.
- Mobile stores tokens in Expo SecureStore.

Most urgent risks:
- Hardcoded fallback PhonePe salt key and test merchant ID in `backend/src/utils/phonepe.js`.
- Large dependency vulnerability exposure (backend 18, frontend 150, mobile 78 advisories).
- Web tokens in `localStorage`/`sessionStorage` (XSS-sensitive).
- Error handler logs full stack traces and returns raw error messages.
- CORS permits requests with no `Origin` header.

## 2. Scope and Methodology

Components reviewed: backend (`backend/src`), frontend (`frontend/src`), mobile (`mobile-app/src`), routes, controllers, models, middleware, uploads, manifests.

Tools executed:
- `git status`, `git log`
- `npm audit --omit=dev` (backend, frontend, mobile)
- Static code review (auth, authorization, uploads, CORS, error handling, secrets)
- Existing backend test suite (`node --test`): 618 passed, 0 failed.

Limitations: no staging/production environment, no emulator/device, no dynamic pentest against live endpoints, no credential-based role testing.

## 3. System Architecture and Attack Surface

Core components: Express REST API, MongoDB models (User, Pandit, Booking, Order, etc.), React web app, React Native/Expo mobile app. Integrations: PhonePe, WhatsApp, email, Ola Maps, Nominatim, Razorpay (legacy). Auth: JWT Bearer tokens. File uploads via multer to `uploads/`.

Trust boundaries: unauthenticated public endpoints, authenticated users, pandits, admins, system_admin. Admin-only routes under `/api/admin`.

## 4. Coverage Matrix

| Security Domain | Components Reviewed | Static Review | Dynamic Test | Result | Limitations |
|---|---|---|---|---|---|
| Authentication | auth controllers, middleware | Yes | Existing tests | Pass | No live brute-force |
| Authorization/IDOR | controllers, routes | Yes | Existing tests | Pass (spot checks) | Not exhaustive |
| API input handling | controllers, models | Yes | No | Reviewed | No fuzzing |
| Business logic/financial | booking, wallet, referral, coupon | Yes | Existing tests | Reviewed | No concurrency tests |
| Files/uploads | upload middleware, app.js | Yes | No | Reviewed | No upload testing |
| Data privacy/secrets | config, .env.example, code | Yes | No | Findings | Secrets not rotated |
| Web security | frontend src | Yes | No | Reviewed | No browser testing |
| Mobile security | mobile src, manifest | Yes | No | Reviewed | No device testing |
| Dependencies | manifests/lockfiles | Yes (npm audit) | No | Findings | No remediation applied |
| Infra/config | app.js, manifests | Yes | No | Reviewed | No prod config access |

## 5. Findings Summary

| ID | Title | Severity | Confidence | Component | Status | Priority |
|---|---|---|---|---|---|---|
| ZUT-SEC-001 | Hardcoded PhonePe salt key fallback | High | Confirmed | backend/src/utils/phonepe.js | Confirmed | P0 |
| ZUT-SEC-002 | Hardcoded PhonePe test merchant ID fallback | Medium | Confirmed | backend/src/utils/phonepe.js | Confirmed | P1 |
| ZUT-SEC-003 | Dependency vulnerabilities (npm audit) | High | Confirmed | backend/frontend/mobile | Confirmed | P1 |
| ZUT-SEC-004 | Web auth tokens in browser storage (XSS theft risk) | Medium | Suspected | frontend/src/utils/authStorage.js | Suspected | P2 |
| ZUT-SEC-005 | Error handler leaks stack traces and raw messages | Medium | Confirmed | backend/src/app.js | Confirmed | P2 |
| ZUT-SEC-006 | CORS allows requests with no Origin | Low | Confirmed | backend/src/app.js | Confirmed | P3 |
| ZUT-SEC-007 | SVG logo upload + static serving (potential stored XSS) | Low | Suspected | backend/src/middleware/upload.js | Suspected | P3 |
| ZUT-SEC-008 | Public uploads exposure beyond KYC/govt docs | Low | Confirmed | backend/src/app.js | Confirmed | P3 |
| ZUT-SEC-009 | Large request body limit (10MB) DoS risk | Low | Suspected | backend/src/app.js | Suspected | P3 |
| ZUT-SEC-010 | Default admin password in .env.example | Informational | Confirmed | backend/.env.example | Confirmed | P3 |
| ZUT-SEC-011 | Mobile deep-link scheme exposure | Informational | Suspected | mobile-app/android/.../AndroidManifest.xml | Suspected | P3 |

## 6. Detailed Findings

### ZUT-SEC-001 — Hardcoded PhonePe salt key fallback
- Severity: High; Confidence: Confirmed; Status: Confirmed.
- Affected: `backend/src/utils/phonepe.js:9`.
- Root cause: fallback salt key `'96434309-7796-489d-8924-ab56988a6076'` used when env/config missing.
- Impact: Payment signature forgery/verification bypass if production misconfigured.
- Remediation: remove fallback; fail closed when salt key absent; rotate any exposed key.
- Tests: unit tests for `_cfg` requiring salt key.

### ZUT-SEC-002 — Hardcoded PhonePe test merchant ID fallback
- Severity: Medium; Confidence: Confirmed.
- Affected: `backend/src/utils/phonepe.js:8`.
- Root cause: fallback merchant ID `'PGTESTPAYUAT86'`.
- Impact: Accidental test-mode processing in production.
- Remediation: remove fallback; require explicit config.

### ZUT-SEC-003 — Dependency vulnerabilities
- Severity: High; Confidence: Confirmed.
- Affected: backend (18: 9 high, 8 moderate, 1 critical), frontend (150: 3 critical, 78 high, 66 moderate, 3 low), mobile (78: 2 critical, 50 high, 25 moderate, 1 low).
- Impact: Known CVEs in transitive deps (express, socket.io, undici, ws, axios, uuid, etc.).
- Remediation: triage reachable advisories; update dependencies in controlled manner; run `npm audit` in CI.

### ZUT-SEC-004 — Web auth tokens in browser storage
- Severity: Medium; Confidence: Suspected.
- Affected: `frontend/src/utils/authStorage.js`, `frontend/src/api/axios.js`.
- Root cause: JWT stored in localStorage/sessionStorage; XSS could exfiltrate.
- Impact: Account takeover if XSS exists.
- Remediation: consider HttpOnly cookies or reduce token lifetime; ensure strong CSP.

### ZUT-SEC-005 — Error handler leaks stack traces
- Severity: Medium; Confidence: Confirmed.
- Affected: `backend/src/app.js:182-200` (console.error(err.stack), returns err.message).
- Impact: Internal details leaked to clients/logs.
- Remediation: log redacted errors server-side; return generic messages in production.

### ZUT-SEC-006 — CORS allows no-Origin requests
- Severity: Low; Confidence: Confirmed.
- Affected: `backend/src/app.js:46` (`if (!origin) return callback(null, true)`).
- Impact: Server-to-server/bypass of origin checks; potential CSRF amplification.
- Remediation: restrict no-origin to trusted server contexts or require API keys.

### ZUT-SEC-007 — SVG logo upload
- Severity: Low; Confidence: Suspected.
- Affected: `backend/src/middleware/upload.js` (logoFilter allows SVG).
- Impact: Stored XSS if SVG served inline (admin-only upload).
- Remediation: disallow SVG or serve with safe content-type/disposition.

### ZUT-SEC-008 — Public uploads exposure
- Severity: Low; Confidence: Confirmed.
- Affected: `backend/src/app.js:146` (`express.static` for `/uploads`); KYC/govt ids blocked.
- Impact: Other uploaded files publicly accessible by URL.
- Remediation: verify all sensitive upload folders are protected; use signed URLs.

### ZUT-SEC-009 — Large body limit
- Severity: Low; Confidence: Suspected.
- Affected: `backend/src/app.js:109-113` (10MB).
- Impact: Potential DoS via large payloads.
- Remediation: reduce limits per route; enforce upload-specific limits.

### ZUT-SEC-010 — Default admin password in .env.example
- Severity: Informational; Confidence: Confirmed.
- Affected: `backend/.env.example` (ADMIN_PASSWORD=change_me).
- Impact: Weak default if copied without change.
- Remediation: remove default; require strong password.

### ZUT-SEC-011 — Mobile deep-link scheme
- Severity: Informational; Confidence: Suspected.
- Affected: `mobile-app/android/.../AndroidManifest.xml`.
- Impact: Deep-link hijacking risk if not validated.
- Remediation: validate deep-link parameters server-side; use App Links.

## 7. Security Improvements

- Add automated secret scanning in CI.
- Add security headers review (CSP) for web.
- Add ownership/IDOR tests for all object endpoints.
- Add rate limiting per user/account, not just IP.
- Add audit logging for sensitive admin actions.

## 8. Prioritized Remediation Roadmap

- P0: ZUT-SEC-001 (remove hardcoded salt key, rotate).
- P1: ZUT-SEC-002, ZUT-SEC-003 (dependency triage).
- P2: ZUT-SEC-004, ZUT-SEC-005.
- P3: ZUT-SEC-006 to ZUT-SEC-011.

## 9. Testing Results

- Backend tests: 618 passed, 0 failed (`node --test`).
- `npm audit`: backend 18, frontend 150, mobile 78 vulnerabilities.
- No dynamic exploitation performed.

## 10. Limitations and Residual Risk

Untested: production config, live endpoints, device/emulator, concurrency/race conditions, payment webhooks with real gateways, file upload exploitation, XSS runtime.

## 11. Final Assessment

Confirmed findings: 6 (ZUT-SEC-001, 002, 003, 005, 006, 008, 010). Suspected: 4 (004, 007, 009, 011). Unverified: 0. Critical: 0. High: 2 (001, 003). Next actions: remove hardcoded PhonePe secrets, triage dependencies, harden error handling.