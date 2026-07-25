# Zutsav — Top 20 Action Items Before Production Launch

Ranked by severity, then priority. Items 1-6 are launch blockers (see Critical Findings for full detail); items 7-20 are the next tier of work that should be scheduled immediately after, or in parallel if resourcing allows.

| # | Item | Priority | Severity | Area |
|---|---|---|---|---|
| 1 | Move KYC/government-ID file serving behind an authenticated route — currently public, no auth check | Critical | Production Blocker | Security |
| 2 | Escape user input before building regex in ~10 search controllers (temples/products/poojas/blog/admin search) to close the ReDoS vector | Critical | Production Blocker | Security |
| 3 | Remove `usesCleartextTraffic="true"` from the mobile Android manifest before any Play Store release | High | Production Blocker | Mobile/Security |
| 4 | Decide and implement: automated gateway refund execution, or formally document refunds as manual-ops; fix the premature `paymentStatus: 'REFUNDED'` write on cancellation | Critical | Major | Backend/Payments |
| 5 | Build mobile-admin screens for pooja/marketplace/festival/temple/masters content management, or document mobile admin as operations-only | Critical | Production Blocker | Mobile/Admin |
| 6 | Build a mobile-admin payout screen (batch review + release), or document payouts as web-only | Critical | Production Blocker | Mobile/Admin |
| 7 | Add compound indexes to Booking and Order collections (`{userId,createdAt}`, `{panditId,status}`, `{status,createdAt}`) — confirmed zero explicit indexes on the platform's highest-traffic collections | High | Major | Backend/Performance |
| 8 | Fix `cancelBooking`'s premature `paymentStatus: 'REFUNDED'` write to only fire once the refund is actually processed | High | Major | Backend/Booking |
| 9 | Remove the hardcoded PhonePe sandbox credential fallback in `phonepe.js` — fail loudly instead of silently defaulting to sandbox in production | High | Major | Backend/Payments |
| 10 | Generate invoices for cart/combo-checkout bookings — currently only the single-booking payment path calls `generateInvoiceForPayment` | High | Major | Backend/Invoicing |
| 11 | Fix the checkout stock-check race condition — validate-then-later-deduct allows overselling of flat (non-variant) products under concurrent checkout | High | Major | Backend/Marketplace |
| 12 | Add production-tier boot validation for Email/WhatsApp provider env vars (currently only JWT_SECRET/MONGO_URI/CLIENT_URL/SERVER_URL are checked) | High | Major | Notification Engine |
| 13 | Fix the in-app notification logging enum mismatch (`'inapp'` vs `'in-app'`) — every in-app notification's delivery log silently fails to write | High | Major | Notification Engine |
| 14 | Add cross-channel notification fallback (WhatsApp fails → try Email/SMS) for OTP and payment-critical events | High | Major | Notification Engine |
| 15 | Emit the `PAYMENT_FAILED` and `PANDIT_ASSIGNED` (customer-facing) notification events — both are declared with clear intent but never actually triggered from any controller | High | Major | Notification Engine |
| 16 | Add a Support/Help/Contact page to the website — currently zero self-serve help path beyond static footer text | High | Major | Website |
| 17 | Add a chart/visualization library (e.g. Recharts) to the frontend and build real revenue/earnings trend charts — every admin "dashboard" is currently static stat cards | High | Major | Admin Panel |
| 18 | Build Coupon/discount-code system end-to-end (model, validation, checkout application, admin CRUD, UI), or get explicit product sign-off that it's descoped for this launch | High | Major | Cross-platform |
| 19 | Fix the mobile Pandit-KYC govt-ID-type enum mismatch (`voter_id`/`driving_license` vs backend's `voter`/`driving`) that silently writes inconsistent data | High | Major | Mobile/Pandit |
| 20 | Harden the backend HTML sanitizer (replace the regex blacklist with `sanitize-html` or DOMPurify) and add client-side DOMPurify before all 7 `dangerouslySetInnerHTML` call sites | High | Major | Security |

## Honorable mentions (Medium priority, worth scheduling soon after the above)

- Rotate all secrets currently sitting in `backend/.env` before production cutover (JWT_SECRET is still the literal placeholder text; WhatsApp token, Gmail app password, Tekipost credentials are live).
- Enforce a strong password + forced first-login change (and ideally MFA) for the seeded `system_admin` account.
- Batch the sequential N+1 `Pooja`/`Kit`/`Product` lookups in the checkout controller into single `$in` queries.
- Add route-level code-splitting (`React.lazy`) to the frontend — currently a single 2.45MB uncompressed bundle ships to every visitor.
- Build a Wishlist feature end-to-end (currently non-existent except a non-persistent heart icon on the mobile dashboard), or confirm descoped.
- Build a review-moderation workflow for booking ratings — currently no admin approval/flagging path exists for any review, on any platform.
- Re-enable (or formally decide to keep hidden) the devotee-facing referral dashboard — fully built on the backend, deliberately commented out in the web UI.
- Standardize rejection-reason strictness across admin reject flows (refund rejection currently allows an empty reason while blog/KYC/booking rejection all require one).
