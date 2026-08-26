# Zutsav — Deployment Configuration Guide

This document explains the centralized configuration system for the Zutsav platform (Backend, Web Frontend, Mobile App). It is written so that a non-technical client or a junior developer can deploy to a new server or change a domain **without opening or searching the source code** — every deployment-specific value lives in one `.env` file per app.

---

## 1. Architecture overview

```
                 ┌─────────────────────┐
                 │   .env  (per app)    │   ← the ONLY thing you edit to deploy
                 └──────────┬───────────┘
                             │
                 ┌───────────▼───────────┐
                 │   src/config/ module    │   ← reads env, computes derived values,
                 │   (one per app)         │      validates, exposes one object
                 └──────────┬───────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   Backend routes      Frontend components   Mobile screens
   & services          & pages               & utils
```

Every app (`backend/`, `frontend/`, `mobile-app/`) has its own `src/config/` folder. Nothing outside `src/config/` reads `process.env` directly anymore — every URL, company detail, and third-party host is imported from `config`.

Changing one value (e.g. the backend's domain) means editing **one line in one `.env` file** and restarting/rebuilding that app — no source changes, no hunting through pages/controllers.

---

## 2. Folder structure

### Backend — `backend/src/config/`
| File | What it holds |
|---|---|
| `env.js` | Loads `.env.${NODE_ENV}` then `.env`; exposes `readEnv(name, ...aliases)` |
| `urls.config.js` | `clientUrl`, `serverUrl`, `adminUrl`, `socketUrl` |
| `cors.config.js` | `allowedOrigins` — single source for both Express CORS and Socket.IO CORS |
| `integrations.config.js` | Fixed third-party API hosts (PhonePe, Groq, WhatsApp Graph, TekiPost) + `database.mongoUri` |
| `company.config.js` | Company name/logo/support contact/legal info used in emails & invoices |
| `constants.js` | Misc shared constants (upload subfolders, upload dir) |
| `validate.js` | Startup validation — hard-fails on missing required config |
| `healthReport.js` | Builds & prints the startup health report; also used by `GET /api/admin/system-health` |
| `index.js` | Aggregate export — `require('../config')` |

### Frontend — `frontend/src/config/`
| File | What it holds |
|---|---|
| `env.config.js` | Reads `process.env.REACT_APP_*` |
| `urls.config.js` | `apiUrl`, `serverOrigin`, `socketUrl`, `webUrl`, `adminUrl`, `supportEmail`, `privacyUrl`, `termsUrl` |
| `company.config.js` | Company legal/contact info for invoices |
| `thirdParty.config.js` | Postal PIN code API, OpenStreetMap Nominatim API |
| `getImageUrl.js` | The one helper for resolving backend-relative file paths to absolute URLs |
| `index.js` | Aggregate export — `import config from '../config'` |

### Mobile — `mobile-app/src/config/`
| File | What it holds |
|---|---|
| `env.js` | Reads `process.env.EXPO_PUBLIC_*` |
| `urls.config.js` | `apiUrl`, `baseUrl`, `webUrl`, `socketUrl` |
| `thirdParty.config.js` | Postal PIN code API |
| `index.js` | Aggregate export — `import config from '../config'` |

---

## 3. How to deploy to a new Ubuntu server / change a domain

You only ever touch env files. In order:

**1. Backend** — edit `backend/.env` (or create `backend/.env.production` for a production-specific override, see §5):
```
SERVER_URL=https://api.yourdomain.com
CLIENT_URL=https://app.yourdomain.com
ADMIN_URL=https://app.yourdomain.com
ADDITIONAL_CORS_ORIGINS=https://www.yourdomain.com
MONGO_URI=mongodb://127.0.0.1:27017/zutsav
```
Restart the backend (`npm start` / your process manager). It will print a health report on boot — see §6.

**2. Frontend** — edit `frontend/.env` (or `frontend/.env.production`):
```
REACT_APP_API_URL=https://api.yourdomain.com/api
REACT_APP_WEB_URL=https://app.yourdomain.com
```
Then rebuild: `npm run build` (CRA bakes these in at build time — see §5). If building via Docker, pass them as `--build-arg` instead (see `frontend/Dockerfile`).

**3. Mobile** — edit `mobile-app/eas.json`'s `build.production.env` block (or `.env` for local dev):
```json
"env": {
  "EXPO_PUBLIC_API_URL": "https://api.yourdomain.com/api",
  "EXPO_PUBLIC_BASE_URL": "https://api.yourdomain.com",
  "EXPO_PUBLIC_WEB_URL": "https://app.yourdomain.com"
}
```
Then run your EAS build (`eas build --profile production`).

That's it — no file inside `src/` needs to change in any of the three apps.

---

## 4. Full environment variable reference

### Backend (`backend/.env`)
| Variable | Required? | Purpose |
|---|---|---|
| `NODE_ENV` | No (defaults `development`) | Selects `.env.${NODE_ENV}` overlay |
| `PORT` | No (default 5000) | Server port |
| `MONGO_URI` | **Yes in production** | MongoDB connection string |
| `JWT_SECRET` | **Yes, always** | Signs auth tokens |
| `JWT_EXPIRES_IN` | No | Token lifetime |
| `CLIENT_URL` (alias `FRONTEND_URL`) | **Yes in production** | Public website URL |
| `SERVER_URL` (alias `BACKEND_URL`) | **Yes in production** | This backend's own public URL |
| `ADMIN_URL` | No (defaults to `CLIENT_URL`) | Admin panel origin, if different |
| `ADDITIONAL_CORS_ORIGINS` | No | Comma-separated extra allowed origins |
| `COMPANY_NAME`, `COMPANY_LOGO`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `COMPANY_GSTIN`, `COMPANY_PAN`, `PRIVACY_URL`, `TERMS_URL`, `DEFAULT_CURRENCY`, `DEFAULT_TIMEZONE` | No | Branding shown in emails/invoices |
| `RAZORPAY_KEY_ID` / `_SECRET` | No (legacy) | Old bookings only |
| `PHONEPE_ENV`, `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_SALT_INDEX` | No | Primary payment gateway |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_API_VERSION` | No | Meta Cloud API |
| `EMAIL_USER`, `EMAIL_PASS`, `NOTIFY_ALWAYS_EMAIL` | No | Nodemailer/SMTP |
| `GROQ_API_KEY` | No | AI spiritual assistant + temporary translation fallback |
| `SARVAM_API_KEY` | No (recommended) | Primary content-translation provider (Indian languages). Falls back to Groq when unset/failing. Also settable via Admin → System Settings (`sarvamApiKey`) |
| `TRANSLATION_PROVIDER` | No (default `auto`) | Which translation provider is tried first: `auto`/`sarvam`/`groq`; the other stays as fallback |
| `ADMIN_NAME`, `ADMIN_PHONE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | No (seed only) | First admin account, created once |
| `GOOGLE_APPS_SCRIPT_URL` | No | Festival/Panchang sync |
| `TEKIPOST_EMAIL`, `TEKIPOST_PASSWORD`, `TEKIPOST_SENDER_ADDRESS_ID`, `TEKIPOST_LOGISTICS_ID` | No | Courier integration |
| `UPLOAD_PATH` | No (default `uploads`) | Local disk upload directory |

Many of the payment/comms values above can *also* be set from **Admin → System Settings** in the app (stored in MongoDB) — the DB value wins if set, env is the fallback. This lets non-technical admins rotate a WhatsApp token or Groq key without a redeploy. Env vars remain the way to set the **bootstrap** values needed before the app can even start (port, Mongo URI, JWT secret, CORS origins).

### Frontend (`frontend/.env`)
| Variable | Required? | Purpose |
|---|---|---|
| `REACT_APP_API_URL` | No (defaults to localhost) | Backend API base — **the single most important variable** |
| `REACT_APP_WEB_URL` | No | This site's own public URL |
| `REACT_APP_ADMIN_URL` | No | Admin panel origin, if different |
| `REACT_APP_SUPPORT_EMAIL` | No | Shown in footer/registration |
| `REACT_APP_PRIVACY_URL` / `REACT_APP_TERMS_URL` | No | Footer legal links |
| `REACT_APP_MICROSOFT_CLARITY_PROJECT_ID` | No | Analytics; disabled if blank |

CRA inlines `REACT_APP_*` at **build time**, not runtime. Rebuilding is required after changing a value.

### Mobile (`mobile-app/.env` for local dev; `eas.json` for real builds)
| Variable | Required? | Purpose |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | No (defaults to a LAN IP) | Backend API base |
| `EXPO_PUBLIC_BASE_URL` | No | Backend origin — used for images and Socket.IO |
| `EXPO_PUBLIC_WEB_URL` | No | Public website — used for referral links |

`EXPO_PUBLIC_*` vars are bundled into the compiled app and are visible to anyone who inspects the binary — **never put a secret behind this prefix.** This is why AI chat calls go through the backend's `POST /api/ai/chat` proxy instead of calling Groq directly from the phone; no Groq key exists in the mobile app.

---

## 5. Switching between development / staging / production

- **Backend**: set `NODE_ENV`. `src/config/env.js` loads `.env.${NODE_ENV}` first, then falls back to `.env` for anything not overridden. Example: `.env.production` can contain just the 4-5 values that differ from `.env`. See `backend/.env.development.example` and `backend/.env.production.example`.
- **Frontend**: CRA natively supports `.env.development` / `.env.production`, chosen automatically by `npm start` vs `npm run build`. No extra tooling needed.
- **Mobile**: EAS build profiles (`development` / `preview` / `production` in `eas.json`) each carry their own `env` block — this *is* the environment separation mechanism for builds. Local `.env` is only used by `expo start` in the Expo Go / dev-client workflow.

---

## 6. Startup validation & health report (backend)

On every boot, `backend/server.js` runs, in order:

1. **`validateConfig()`** (`src/config/validate.js`) — `JWT_SECRET` is required in every environment; `MONGO_URI`, `CLIENT_URL`, and `SERVER_URL` are additionally required when `NODE_ENV=production` (a silent localhost fallback in production is worse than a loud failure). Missing config prints a clear list and exits with code 1.
2. MongoDB connects.
3. **`printHealthReport()`** (`src/config/healthReport.js`) prints a table:

```
──────────────── Deployment Configuration Health Report ────────────────
Deployment Environment   development
Backend API              OK — http://localhost:5000
Frontend                 http://localhost:3000
Admin Panel              http://localhost:3000
MongoDB                  ✅
Razorpay (legacy)        ⚠️  Pending
PhonePe                  ✅
Groq AI                  ✅
SMTP / Email             ✅
WhatsApp                 ✅
TekiPost                 ✅
Cloudinary               ℹ️  Not Integrated
──────────────────────────────────────────────────────────────────────
```

The same status data powers `GET /api/admin/system-health` (used by the admin panel), so there's one source of truth for "is X configured" rather than two independently-maintained checks.

**Note on services not shown here:** *Cloudinary* has schema fields reserved for a possible future migration off local disk storage, but no SDK is installed and no code calls it — it is honestly reported as "Not Integrated" rather than faked. *Microsoft Clarity* is a frontend-only analytics integration (see `REACT_APP_MICROSOFT_CLARITY_PROJECT_ID`) and has no backend component to report on. *BHASHINI* does not exist anywhere in this codebase — if it's needed, it would be a new integration, not a config-wiring task.

---

## 7. Multi-domain / white-label readiness

- `ADDITIONAL_CORS_ORIGINS` (backend) accepts a comma-separated list, so a second brand/domain can be added without a code change.
- Backend `company.config.js` centralizes the branding shown in system emails; a white-label deployment overrides it via env vars, no template edits.
- `SystemSettings` (MongoDB, admin-editable) already carries platform name, logo, and per-integration credentials — this is the "runtime business layer." Env vars are the "bootstrap/infra layer" needed before the app can start. A future graphical deployment wizard would write to the existing `SystemSettings` admin API for anything in the business layer, and simply display the required env-file edits for the bootstrap layer — no new backend endpoints are needed for that.

---

## 8. Known follow-ups (not part of this refactor's scope)

- **Mobile push notifications**: `mobile-app/app.json` has no `extra.eas.projectId`. The code (`src/utils/fcm.js`) already falls back gracefully to `Constants.easConfig.projectId`, which EAS populates automatically once the project is linked (`eas init` / first `eas build`) — so this is usually a non-issue, but if push tokens ever come back empty, link the project with EAS and it will resolve itself.
- **`eas.json` submit credentials** (`YOUR_APP_STORE_CONNECT_APP_ID`, `YOUR_TEAM_ID`, `./google-service-account.json`) are placeholders that must be filled in before running `eas submit` — unrelated to the URL/config work done here.
- **Privacy/Terms pages**: the frontend footer now links to `REACT_APP_PRIVACY_URL` / `REACT_APP_TERMS_URL` (configurable), but no such pages exist in the app yet — set these to point at wherever the real policy content lives (a separate CMS page, a PDF, etc.) or build the pages as a separate task.
- **Rotate the Groq key** that was previously committed in `mobile-app/.env` (`EXPO_PUBLIC_GROQ_API_KEY`) — it has been removed from this app (it was never actually referenced in code, so it wasn't compiled into any released binary), but since it lived in a plaintext file it should be rotated at https://console.groq.com as a precaution.
