# Manual Billing — Implementation Report

Status: complete (backend + admin frontend). No commit made.
Date: 2026-10-22

## 1. What was built

Admin-created offline product sales ("manual billing"), with:

- A dedicated manual invoice series `MAN-YYYY-NNNNNN` that is independent of the
  existing automatic `INV-YYYY-NNNNNN` series.
- Server-authoritative pricing and GST (client submits only catalog IDs,
  quantities and per-line discounts).
- Admin-configurable company GST registrations ("Bill From"), snapshotted onto
  each issued invoice.
- Offline payment ledger with partial payments, idempotent recording, and
  reverse-only corrections.
- Stock deduction exactly once at finalization, restored exactly once on
  cancellation.
- Admin-only access to manual invoice documents; the existing booking invoice
  and gateway flows are untouched.

## 2. Data model

New/changed models:

- `backend/src/models/InvoiceCounter.js`
  - Added `series` (default `'INV'`) and compound unique index
    `{ series: 1, year: 1 }`. Legacy rows are claimed as `INV` with a cheap
    self-healing `updateMany` before each allocation; the old year-only unique
    index is dropped once per process. `seq` is never reset or renumbered.
- `backend/src/models/Invoice.js`
  - `source: 'booking' | 'manual'` (default `booking`).
  - Source-aware requiredness in `pre('validate')`.
  - `lineItems[]` snapshot, `sellerRegistrationId`, `sellerSnapshot`,
    `idempotencyKey` (unique partial index), `stockDeducted`, `stockRestored`,
    `createdBy`.
  - New indexes including `{ source: 1, invoiceDate: -1 }`.
- `backend/src/models/OfflinePayment.js` (new)
  - `invoiceId`, `amount`, `method` (CASH/UPI/BANK_TRANSFER/CARD/OTHER),
    `kind` (RECEIPT/REVERSAL), `reversesPaymentId`, `reference`, `note`,
    `receivedAt`, `recordedBy/Name`, unique `idempotencyKey`, `status`.
  - Immutable: update/delete hooks reject all mutations. Tests clean up via the
    raw collection.
- `backend/src/models/InventoryLog.js`
  - `invoiceId` link; reasons `manual_sale` / `manual_sale_cancelled`.
- `backend/src/models/SystemSettings.js`
  - Typed `companyBillingRegistrations[]` (legalName, GSTIN, PAN, address, state,
    stateCode, isActive, isDefault).

`PaymentLedger` is never written for manual sales (offline money lives only in
`OfflinePayment`). No `Booking`, no `User` (walk-in is snapshot-only), no coupon,
coin, wallet, referral or gateway interaction is created.

## 3. Numbering and concurrency

- `generateInvoiceNumberForSeries(series)` validates/sanitizes the series,
  atomically increments `{ series, year }` with `findOneAndUpdate(..., { upsert:
  true, new: true })`, and formats `${SERIES}-${year}-${seq padded to 6}`.
- `generateInvoiceNumber()` delegates with `'INV'`, preserving the historic
  format byte-for-byte.
- Finalization retries once on an `E11000` invoice-number collision (the
  consumed number is never reused; gaps are acceptable).
- Verified by tests: 25 concurrent allocations are unique and contiguous;
  legacy counters without `series` continue from their existing `seq`; MAN and
  INV advance independently.

## 4. Calculation and tax rules

`backend/src/utils/manualBillCalculator.js`:

- Prices come from live `Product` / variant documents (`salePrice` when valid,
  else `price`); inactive/deleted/missing products are rejected.
- Per-line manual discount must be ≥ 0 and ≤ line gross.
- Tax: `calculateItemTax(taxable, 1, product.taxRate)` — the existing frozen
  `financeUtils` helper.
- `lineTotal = taxable + taxAmount`; totals are rounded to paise.
- GST split is IGST when the normalized customer state differs from the seller
  registration state, otherwise CGST + SGST halves.
- Limits: 100 lines, 10,000 units per line.
- Validation errors carry HTTP 400 plus a `details[]` array; the global error
  handler forwards `details`.

The client can tamper with totals prices/tax rates in the request body without
effect — the server recomputes from catalog data (covered by tests).

## 5. Company identity / GST registration

`backend/src/utils/billingRegistrationService.js`:

- Registrations are read from `SystemSettings.companyBillingRegistrations`.
- GSTIN is validated structurally only (state prefix, embedded PAN,
  check-character shape); PAN format is validated when present. The service
  derives `stateCode` from the GSTIN prefix and enforces at most one default.
- When nothing is configured, exactly one fallback identity is exposed
  (`07AACCZ8054C1ZB`, PAN `AACCZ8054C`, Delhi) marked `isFallback`/not verified.
- Manual invoice issuance with the fallback requires an explicit
  `taxIdentityConfirmed: true` from the admin; the flag is snapshotted.
- The backend never trusts client-supplied GSTIN/state/tax values; it re-resolves
  the selected registration and computes tax from its state.
- Registrations are editable in Admin → System Settings → **Billing / GST**.

## 6. API surface (admin only: `protect` + `authorize('admin')`)

- `GET  /api/admin/manual-billing/registrations`
- `GET  /api/admin/manual-billing/products?search=&limit=`
- `POST /api/admin/manual-billing/preview`
- `POST /api/admin/manual-billing/invoices` (idempotent; optional initial payment)
- `GET  /api/admin/manual-billing/invoices/:id/payments`
- `POST /api/admin/manual-billing/invoices/:id/payments`
- `POST /api/admin/manual-billing/payments/:id/reverse`

Invoice register/document changes:

- `GET /api/admin/invoices?source=manual|booking` filtering; booking means
  `source != 'manual'` so historical rows remain visible.
- `monthRevenue` now excludes manual; `manualMonthRevenue` and `sourceStats`
  returned separately. CSV export gains `Invoice Source` and `Seller GSTIN`.
- `GET /api/invoices/number/:invoiceNumber` for manual invoices is admin-only and
  returns `{ invoice, booking: null, payments, paymentSummary }`.
- Cancelling a manual invoice restores stock once via the `stockRestored` guard.

All mutations are audited through `auditService`/`AdminAuditLog`.

## 7. Admin UI

- New sidebar item **Manual Billing** (`/admin?tab=manual-billing`) with
  translations in all 11 locale files.
- `frontend/src/components/admin/ManualBillingTab.jsx`:
  registration picker with fallback warning + explicit confirmation, walk-in
  customer form, debounced catalog search, variant selection, per-line quantity
  and discount, stock toggle, server preview panel, initial payment entry and
  finalization; recent manual bills with payment recording/reversal and print
  links. Preview requests are race-guarded; finalization uses an idempotency key.
- `frontend/src/components/admin/BillingRegistrationsSection.jsx`: add/edit/
  remove registrations, default selection, validation errors surfaced.
- `frontend/src/components/invoice/ManualInvoiceView.jsx`: print-ready snapshot
  invoice (seller snapshot, line items, GST split, payment summary and ledger,
  fallback notice). `InvoicePage` branches to it before any Booking lookup.
- Invoice Register: source column, source filter (also applied to CSV export),
  gateway/manual month revenue cards.
- `frontend/src/utils/numberToWords.js`: shared amount-in-words helper
  (extracted from `InvoicePage`).

## 8. Verification

Backend (`backend/`, local MongoDB):

- New suite `tests/manual-billing.test.js`: **28/28 passing** — numbering
  (INV format preserved, MAN independence, legacy claim, 25-way concurrency, no
  reuse), calculations (catalog pricing, variants, discounts, rounding, invalid
  inputs, client tampering, IGST vs CGST/SGST), authorization, fallback gating,
  settings GSTIN validation, create/idempotency/isolation (no Booking, no
  PaymentLedger, no User), inventory (deduct once, insufficient stock, restore
  once), payments (partial, idempotent retry, overpayment rejection, reversal,
  immutability), rendering/register (admin-only, snapshot immunity, source
  filters, revenue split, payment history).
- Existing regression suites: **195/195 passing** (`payment-mode` 65,
  `urgent-pricing` 49, `coupon-system` 26, `coin-redemption` 19,
  `razorpay-deactivation` 6, `admin-phase3` 30).
- Combined: **223/223 passing**.

Frontend:

- `npm run build` compiles successfully; no warnings from any new/changed file
  (remaining warnings are pre-existing in unrelated files). Generated build
  artifacts were reverted so only source changes remain.

## 9. Known limitations (v1, intentional)

- Corrections are cancel-only; there is no credit-note model.
- Only catalog products can be billed (no ad-hoc/one-off line items).
- `Product` has no HSN/SAC field, so invoice HSN stays empty rather than being
  invented.
- Manual revenue is excluded from existing gateway revenue statistics by
  default; it is visible via the source filter and the separate month figure.
- The fallback GST identity remains unverified by definition; admins should
  configure real registrations in System Settings.
- The legacy marketplace invoice renderer's hardcoded 18% display is untouched
  and outside this feature's scope.
