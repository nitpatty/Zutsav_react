# Zutsav — Release-Readiness Audit: Release Summary

**Audit date:** 2026-07-25
**Method:** 8 independent code-verification passes (not documentation review) across `backend/`, `frontend/`, `mobile-app/`, the notification engine, and a dedicated security/performance/bug-hunt sweep. 550 findings logged; every row in the accompanying workbook is backed by a specific file and line range that was actually opened and read, not inferred from naming conventions or assumed from a prior session.
**Reference material:** `Zutsav_Project_Tracker.xlsx` (client-provided) was reviewed for structural/scope context only. It reflects the original 30-milestone client wishlist (all items marked "Not Started" in that file) and was **not** used as a source of truth — several of its items (Razorpay-only payments, video consultation via Google Meet, AI kundli analysis, temple livestreaming, 7-language support, subscription plans, WhatsApp chatbot with NLP) are not built in the current codebase and are called out below as descoped/future rather than force-fit as "missing" against this audit's own findings.

## Release Readiness Score: 74%

A weighted feature-completion score across all 539 applicable findings (Critical priority weighted 3x, High 2x, Medium 1x, Low 0.5x) comes out to **84%**, reflecting genuinely mature engineering in the core product. That number is adjusted down to **74%** to account for 3 unresolved Production-Blocker-severity security defects and 3 unresolved Critical-priority gaps that gate a safe launch regardless of how complete everything else is — a platform with a public PII-exposure hole is not 84% ready.

| Platform | Weighted completion |
|---|---|
| Backend | 80.0% |
| Website | 85.2% |
| Mobile | 88.4% |
| Security module (subset) | 45.3% |

## What Shipped Well

**Booking, payment, and refund engineering is the strongest part of the codebase.** PhonePe webhook signature verification is applied consistently across all three webhook handlers (booking, checkout, marketplace); payment processing is idempotent against duplicate webhook delivery at both the application and database level; refund and payout amounts are always recalculated server-side from a centralized `financeUtils`/`refundEngine`/`payoutUtils` module rather than trusted from client input; and booking completion is gated behind a bcrypt-hashed, time-boxed OTP shared between devotee and pandit — a genuinely thoughtful anti-fraud design.

**Role-based access control is real, not cosmetic.** Every admin-only backend route is independently gated server-side by `authorize('admin')` middleware — verified by direct inspection of 8+ route files, not assumed from the frontend hiding a button. The `system_admin` tier goes further: its management routes are deliberately mounted outside the standard `/api/admin` route tree specifically so a plain admin's blanket authorization can never reach them, with the frontend independently hiding the nav item and re-checking the role a second time at the component level. This is textbook defense-in-depth and one of the strongest findings in the entire audit.

**The notification engine is a genuine rebuilt system, not a stub.** Live production credentials for Email (Gmail SMTP) and WhatsApp (Meta Cloud API) are wired and confirmed present; a durable MongoDB-backed job queue with exponential backoff (30s→30min, 5 attempts, dead-letter) actually retries failed sends; and a pre-send template validator checks that every `{{placeholder}}` in a message resolves against real data before sending, specifically preventing the "undefined" or literal-field-name bug class that the audit was asked to hunt for.

**Mobile-web parity is unusually strong for a first release.** The booking price-calculation formula (paisa rounding, percentage math) was independently traced and found byte-identical across `backend/src/utils/financeUtils.js`, `frontend/src/utils/priceEngine.js`, and `mobile-app/src/utils/priceEngine.js` — no drift found anywhere. Nearly all 70+ mobile screens across Devotee and Pandit roles are genuinely wired to real backend endpoints with real loading, empty, and error states, not mocked data.

**Panchang, Festival Calendar, and Temple Directory are well-engineered, not corners cut.** The Panchang service has 24-hour response caching, upstream response validation before caching bad data, and deliberately leaves unverifiable astrological fields (Yamaganda, Gulika Kaal, moonrise/moonset) as `null` rather than fabricating values — a notable choice not to guess at religiously/astrologically sensitive data.

## What Must Be Fixed Before Launch

Six items meet the bar of "open, and either Production-Blocker severity or Critical priority" — full detail and file references are in the workbook's **Release Blockers** sheet:

1. **KYC/government-ID documents are publicly downloadable with no authentication** (Critical / Production Blocker) — the single scariest finding in this audit. Real PII, not theoretical.
2. **Unescaped regex search on public endpoints** creates a ReDoS denial-of-service vector across ~10 controllers (Critical / Production Blocker).
3. **Mobile app ships with cleartext traffic enabled** (High / Production Blocker) — must be removed before a Play Store release.
4. **Refund execution has no automated gateway API call** anywhere in the codebase (Critical / Major) — admin actions only record that a refund happened; nothing actually moves money.
5. **Mobile admin cannot manage the pooja/marketplace/festival/temple/masters catalog at all** (Critical / Production Blocker) — zero screens exist for content management that the web admin panel fully supports.
6. **Mobile admin cannot process pandit payouts** (Critical / Production Blocker) — no payout screen exists in mobile admin whatsoever.

See the separate **Critical Findings** document for full technical detail on each, and **Top 20 Action Items** for these plus the next tier of High-priority work.

## What's Missing But Not Launch-Blocking

Coupons/discount codes, a customer-facing Wishlist, review moderation (no admin approval/flagging workflow for any review, on any platform), and a dedicated Support/Contact/FAQ page do not exist anywhere in the codebase — confirmed by repository-wide search across `backend/`, `frontend/`, and `mobile-app/`. These read as intentionally descoped-for-v1 rather than broken, but should get an explicit product sign-off before any launch marketing promises them. A devotee-facing referral dashboard was fully built on the backend and then deliberately commented out in the web UI (`frontend/src/pages/Profile.jsx:284-286`, "Referral system temporarily hidden — backend intact, UI disabled") — this is a one-line product decision away from shipping, not an engineering gap. No chart/visualization library exists anywhere in the frontend (`package.json` confirmed), so every admin "dashboard" — revenue, referral analytics, pandit earnings — is static stat cards and tables rather than trend charts.

## Audit Coverage Detail

| Pass | Findings |
|---|---|
| Backend Infrastructure (routes, auth, validation, config, security posture) | 87 |
| Backend Domain Logic (booking, payment, refund, invoice, marketplace, Panchang) | 76 |
| Notification Engine (email/WhatsApp channels, queue, triggers, templates) | 52 |
| Website — Devotee & Guest facing | 106 |
| Admin Panel + Pandit Web Portal | 63 |
| Mobile App — Devotee/User role | 70 |
| Mobile App — Pandit/Admin roles + cross-platform parity | 60 |
| Security, Performance & Bug Hunt (cross-cutting) | 36 |
| **Total** | **550** |

Status breakdown: 421 Completed · 58 Missing · 36 confirmed Bugs · 17 Needs Review · 7 In Progress · 11 Not Applicable.

## Deliverables

1. **`Zutsav_Release_Readiness_Audit.xlsx`** — 16-sheet workbook (Executive Summary, Website/Mobile/Backend/Admin/Pandit/Devotee Audit, API Audit, Notification Engine, Security, Performance, UI-UX, Known Bugs, Release Blockers, Future Improvements, Production Checklist), color-coded by status, every row citing real files.
2. **This document** (Release Summary).
3. **Critical Findings** — deep technical detail on the 6 launch blockers plus the highest-severity confirmed bugs.
4. **Top 20 Action Items** — the ranked punch list to work through before production launch.
