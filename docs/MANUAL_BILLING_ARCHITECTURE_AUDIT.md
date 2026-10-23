# ZUTSAV — Manual Billing Architecture Audit

**Scope:** Read-only architectural audit of the existing automatic invoice & billing system, performed to establish the safest design for a future **Manual Billing** feature in the Admin panel.
**Status:** AUDIT ONLY — no application code, schema, configuration, payment state, or data was changed.
**Date of audit:** 2026-10-21
**Repository:** `zutsav-updated` · branch `main` · HEAD `7bf6ee1` ("fixed: security issues/ and added pandit booking validation for same time")
**Working tree at audit start and end:** clean (`git status` → "nothing to commit, working tree clean")

> All file/line references below were read from the actual source in this repository. Where a statement is architectural inference rather than observed code, it is explicitly labelled **[inference]** or **[client decision]**.

---

## 1. Executive summary

Zutsav has **one** persisted, numbered invoice system today, and it is **booking-bound and payment-bound**:

- An `Invoice` document is created only when a **PhonePe payment for a Booking** is confirmed (`backend/src/utils/invoiceGenerator.js:52`). It is idempotent per `PaymentLedger` row.
- Invoice numbers are `INV-<calendarYear>-<6 digits>` (`INV-2026-000001`), produced by an **atomic Mongo `findOneAndUpdate + $inc`** counter collection (`InvoiceCounter`, one doc per year) — this is concurrency-safe and is the correct foundation to reuse.
- The `Invoice` schema **hard-requires a booking**: `bookingId` (`Invoice.js:8`) and `bookingNumber` (`Invoice.js:13`) are `required: true`. There are **no line items stored on the invoice**; product/pooja lines are re-read from the live `Booking` at render time (`invoice.controller.js:9-24`).
- **Marketplace orders do not create `Invoice` records at all.** Their "invoice number" (`INV-<orderNumber>`) is assembled **in the browser** (`AdminDashboard.jsx:4760`, `MyOrders.jsx:31`) and printed from live `Order` data with a **hard-coded 18% GST back-calculation** (`AdminDashboard.jsx:4763`, `MyOrders.jsx:70`) that ignores the per-item `taxRate` stored on the order.
- There is **no server-side PDF library**. All "PDFs" are browser `window.print()` (web) or `expo-print` (mobile).
- Money calculations are centralized in `backend/src/utils/financeUtils.js` (paisa-precision rounding) with a deliberate client mirror `frontend/src/utils/priceEngine.js`. This engine is the correct reuse target for Manual Billing — **but only the generic primitives (`roundToPaise`, `calculatePercentage`, `calculateItemTax`), not `calculatePricing()`, which is pooja/booking-specific.**
- Payment records live in `PaymentLedger`, which is also **booking-bound and gateway-shaped** (`bookingId` required, `merchantTransactionId` unique/required). Offline payments must not be written into it without a dedicated channel model.

**Headline recommendation:** keep the automatic `INV-…` series untouched; add a **separate manual series issued by the same atomic counter service**, extend the existing `Invoice` model with a `source` discriminator + a **line-item snapshot**, record offline money in a **new offline-payment collection** (never `PaymentLedger` with fake gateway IDs), reuse `financeUtils` primitives + `inventoryUtils.deductStock`, and reuse the existing print template after refactoring its data source into a normalized invoice view-model.

---

## 2. Repository baseline and scope

### 2.1 Git baseline (Phase 1)

| Check | Result |
|---|---|
| `git status` | clean — no pre-existing uncommitted changes to preserve |
| `git branch --show-current` | `main` (up to date with `origin/main`) |
| Recent commits | `7bf6ee1` security/booking-validation · `8bdae43` map/profile fixes · `b77aa5e` latest fixes-V1 · `5d27188` Email templates · `a635832` notification engine + major security fixes · `ffb26bb` invoice logo/invoice-page fixes |
| Files modified by this audit | **only** `docs/MANUAL_BILLING_ARCHITECTURE_AUDIT.md` (this document) |

No reset, discard, stage, or commit was performed. No test data or financial records were created outside disposable `*_test` databases used by the repo's own test harness (see §15).

### 2.2 Module inventory

```
zutsav-updated/
├── backend/            Node/Express + Mongoose API (server.js, src/app.js)
│   ├── src/config      company, payment, shipping, urls, configManifest (Config Center)
│   ├── src/controllers 47 controllers (booking, checkout, invoice, admin, marketplace, mockPayment, …)
│   ├── src/models      61 models (Invoice, InvoiceCounter, PaymentLedger, Booking, Order, Product, Kit, …)
│   ├── src/routes      42 route files
│   ├── src/services    auditService, couponService, coinRedemptionService, walletService, …
│   ├── src/utils       invoiceGenerator, financeUtils, inventoryUtils, refundEngine, phonepe, razorpay
│   ├── notification-engine/   event/notification delivery (INVOICE_GENERATED, PAYMENT_SUCCESS, …)
│   └── tests/          28 test files, runner = `node --test` (package.json "test")
├── frontend/           React (CRA) — src/pages/AdminDashboard.jsx is the Admin panel (10,869 lines)
├── mobile-app/         Expo/React Native — src/screens/user/InvoiceScreen.jsx
├── docs/               existing audits (SECURITY_AUDIT_REPORT, RAZORPAY_LEGACY_SECURITY_AUDIT, WhatsApp/consent series) — no prior billing-architecture doc
└── release-audit/      release readiness artifacts
```

### 2.3 Billing-relevant modules (the surface Manual Billing must fit)

| Concern | Files |
|---|---|
| Invoice persistence | `backend/src/models/Invoice.js`, `backend/src/models/InvoiceCounter.js` |
| Invoice generation | `backend/src/utils/invoiceGenerator.js` |
| Invoice API | `backend/src/controllers/invoice.controller.js`, `backend/src/routes/invoice.routes.js`, admin routes `admin.routes.js:146-149` |
| Payment persistence | `backend/src/models/PaymentLedger.js`, `Booking.paymentAttempts` (`Booking.js:211-222`) |
| Payment/gateway | `booking.controller.js` (PhonePe verify/webhook), `checkout.controller.js`, `utils/phonepe.js`, `controllers/mockPayment.controller.js` (PAYMENT_MODE=mock only) |
| Calculation | `utils/financeUtils.js` (+ mirror `frontend/src/utils/priceEngine.js`), `utils/refundEngine.js` |
| Orders / products / stock | `models/Order.js`, `models/Product.js`, `models/Kit.js`, `utils/inventoryUtils.js`, `models/InventoryLog.js` |
| Customers | `models/User.js` (incl. `savedAddresses`), `Booking.userDetails` snapshot, `Order.shippingAddress` |
| Admin UI | `frontend/src/pages/AdminDashboard.jsx` (`InvoicesTab` at :9830, `OrdersTab` at :4730), `frontend/src/components/layout/Sidebar.jsx:79` |
| Invoice rendering | `frontend/src/pages/InvoicePage.jsx`, `frontend/src/pages/MyOrders.jsx:21-78`, `AdminDashboard.jsx:4755-4878`, `mobile-app/src/screens/user/InvoiceScreen.jsx` |
| Audit trail | `services/auditService.js`, `models/AdminAuditLog.js` |
| Authorization | `middleware/auth.js` (`protect`, `authorize`), `routes/admin.routes.js:15`, `utils/roleUtils.js` |

### 2.4 Existing documentation

No prior document covers billing/invoice architecture. Nearest neighbours: `docs/SECURITY_AUDIT_REPORT.md`, `docs/RAZORPAY_LEGACY_SECURITY_AUDIT.md` (documents that legacy Razorpay endpoints now return HTTP 410 — `booking.routes.js:13-19`). This is the first billing-architecture audit.

---

## 3. Existing billing architecture and flow diagrams

### 3.1 Inventory of current invoice-generation flows

| # | Flow | Creates `Invoice` row? | Initiated by |
|---|---|---|---|
| F1 | Booking full/partial payment verified (`GET /api/bookings/verify-phonepe/:mtid`) | **Yes** | `booking.controller.js:519` |
| F2 | Booking payment webhook (`POST /api/bookings/phonepe-webhook`) | **Yes** | `booking.controller.js:799` (standard), `:763` (`ZUT_REM_` remaining) |
| F3 | Remaining-balance payment verified (`GET /api/bookings/verify-remaining/:mtid`) | **Yes** | `booking.controller.js:713` |
| F4 | On-demand legacy backfill (`GET /api/invoices/booking/:bookingId` when no invoices exist) | **Yes (migration)** | `invoice.controller.js:50` → `invoiceGenerator.js:125` |
| F5 | Cart checkout payment success (`/api/checkout/verify/:mtid`, `/api/checkout/webhook`) | **No** — only marks `Order` paid + `deductStock` (`checkout.controller.js:439-444`, `:510-515`) | — |
| F6 | Marketplace standalone order payment success | **No** | `marketplace.controller.js` |
| F7 | Marketplace/admin "download invoice" | **No** — HTML assembled client-side from live `Order` | `marketplace.controller.js:547-565`, `admin.controller.js:3406-3415` |
| F8 | Coin-covered (₹0 payable) booking completion | **No invoice** — `booking.controller.js:445-461` | — |
| F9 | Admin `PAY_LATER` / `COD` approval | **No ledger, no invoice** — `admin.controller.js:2134-2195` | — |

**Distinguishing executable paths from legacy/unused:**
- Razorpay create/verify routes are registered as `legacyRazorpayGone` (HTTP 410) — `booking.routes.js:13-19`. The handlers still exist in `booking.controller.js` but are unreachable.
- `generateInvoiceNumber()` is **module-private** (`invoiceGenerator.js:19`) — nothing else can mint an `INV-` number, and no frontend mints one for booking invoices.
- Marketplace/kit "invoices" (F7) are **not** backed by the `Invoice` model — they are cosmetic print views.

### 3.2 Flow A — Booking payment → invoice (the only real invoice pipeline)

```
Frontend  POST /api/bookings/create-phonepe-order
          booking.controller.createPhonePeBooking (:242)
            ├─ calculatePricing(pooja, kitPrice, urgent)      → financeUtils.calculatePricing (:272)
            ├─ couponService.validateCoupon (server-authoritative) (:310)
            ├─ resolveCoinRedemption (server-authoritative)   (:332)
            ├─ resolveChargeAmount → FULL | PARTIAL           (:82-100)
            ├─ Booking.create { amount:grandTotal, amountPaid:0,
            │                   remainingAmount, status:'pending_payment' } (:386-415)
            └─ PaymentLedger.create { amount:chargeAmount, paymentType,
                                      paymentStatus:'PENDING', merchantTransactionId } (:418-424)

Gateway →  GET  /api/bookings/verify-phonepe/:mtid   (user-triggered poll)   OR
           POST /api/bookings/phonepe-webhook        (checksum-verified)     (:730)
            ├─ checkPhonePeStatus() / verifyWebhookChecksum()   ← the ONLY trust boundary
            ├─ booking.amountPaid / remainingAmount / paymentStatus updated
            ├─ ledger.paymentStatus='SUCCESS', paidAt=now
            └─ generateInvoiceForPayment(booking, ledger, poojaName)   (:519 / :713 / :763 / :799)
                 ├─ IDEMPOTENCY: Invoice.findOne({paymentLedgerId: ledger._id}) → return existing (:55-58)
                 ├─ invoiceNumber = generateInvoiceNumber()   ← number minted HERE (:60)
                 ├─ Invoice.create({... snapshot of booking + ledger }) (:69-103)
                 └─ PaymentLedger.findByIdAndUpdate(ledger._id, {invoiceId}) (:107)
```

**Point of invoice-number generation:** `invoiceGenerator.js:60` (and `:145`, `:192` for legacy backfill) — **server-side only**, immediately before `Invoice.create`.

**Customer/address source:** `booking.userDetails` snapshot (`invoiceGenerator.js:78-84`), copied into flat `customerName/Phone/Email/Address/Pincode/State/City` invoice fields.

**Line-item source:** *not stored*. `poojaName`, `scheduledDate/Time` are snapshotted (`Invoice.js:13-16`), but kit/product line detail is re-populated from the live `Booking` at read time (`invoice.controller.js:9-24` → `loadBookingForInvoice`). Amount fields (`poojaAmount, kitAmount, kitGST, platformFee, platformGST, urgentSurcharge, grandTotal`) are snapshotted (`Invoice.js:42-49`).

**Payment representation on the invoice:** `amountPaid` (this invoice), `previouslyPaid`, `outstandingAfter` (`Invoice.js:37-39`), computed as `previouslyPaid = booking.amountPaid - ledger.amount` and `outstandingAfter = booking.remainingAmount` (`invoiceGenerator.js:66-67`).

**Generated once or repeatedly?** Once per `PaymentLedger` row. A retry/new attempt creates a *new* ledger row → legitimately produces an additional invoice (partial → remaining sequence). Reads never mint numbers; only the legacy path (`getOrCreateLegacyInvoices`) creates invoices on read, and it first returns existing rows (`invoiceGenerator.js:127-128`).

### 3.3 Flow B — Partial payment lifecycle

```
create (paymentMode=PARTIAL)  →  ledger #1 (PARTIAL)  →  invoice #1 {paymentType:'PARTIAL',
                                                            previouslyPaid:0,
                                                            outstandingAfter:grandTotal-charge}
POST /api/bookings/:id/pay-remaining  (:623)  → ledger #2 (REMAINING, PENDING)
      guard: existing PENDING REMAINING ledger → 409 (:639-650)
      amount = booking.remainingAmount (server-side, never client) (:634)
verify/webhook ZUT_REM_ → booking.FULLY_PAID, ledger SUCCESS
                       → invoice #2 {paymentType:'REMAINING',
                                     previouslyPaid=charge1, outstandingAfter:0}  (:713 / :763)
```

Partial-payment policy is admin-configurable: `partialPaymentEnabled/MinAmount/Mode/Options` (`SystemSettings.js:41-44`, read in `booking.controller.js:73-79`).

### 3.4 Flow C — Marketplace order "invoice" (no persistence)

```
GET /api/marketplace/orders/:id/invoice  → marketplace.controller.getOrderInvoice (:548)
       only for paid/confirmed/… statuses (:554) → returns { order, shipment } (no Invoice)
GET /api/admin/orders/:id/invoice        → admin.controller.getAdminOrderInvoice (:3407) → { order, shipment }

Frontend → _openInvoiceWindow(order, shipment, logo)  AdminDashboard.jsx:4755
             invoiceNo  = `INV-${order.orderNumber}`            ← NUMBER BUILT IN BROWSER (:4760)
             taxAmt     = roundToPaise(total * 0.18 / 1.18)     ← HARD-CODED 18% (:4763)
             printed via window.open + window.print() (:4775, :4873)
MyOrders.jsx:29-78 does the same independently (:31 number, :70 "GST @ 18%")
```

This is the **only** place an invoice number is generated on the frontend, and it is derived from `Order.orderNumber`, which itself is minted non-atomically in a pre-save hook (`Order.js:92-98`: `countDocuments()` + timestamp — **race-prone**, unlike `InvoiceCounter`).

### 3.5 Refunds / cancellation / credit notes

- **Cancellation (user):** `booking.controller.js:929-990` — computes `calculateRefundBreakdown`, sets `booking.status='cancelled'`, populates `booking.refund`. **It does not touch `Invoice` documents** (no `Invoice` reference anywhere in that function) — invoices remain `status:'active'`.
- **Refund processing (admin):** `admin.controller.js:1151-1225` — re-derives eligible amount server-side (`refundEngine.js:40-56`: platform fee + its GST are never refundable), writes `booking.refund`, `booking.auditLog`, and an `AdminAuditLog` entry with `severity:'critical'`. **No credit note / negative invoice is created.**
- **Invoice correction mechanism that does exist:** `PATCH /api/admin/invoices/:id/cancel` (soft-cancel with reason + audit, `invoice.controller.js:167-191`) and `PATCH …/archive` (`:194-211`). Schema comment is explicit: *"Invoices are NEVER physically deleted — only soft-cancelled or archived"* (`Invoice.js:60`). There is **no amendment/credit-note model** — a documented gap.
- **Gap:** cancelling a booking does **not** cancel its invoices; the two lifecycles are only linked manually by an admin.

---

## 4. Current invoice-number implementation

### 4.1 Format and owner

```js
// backend/src/utils/invoiceGenerator.js:19-27
async function generateInvoiceNumber() {
  const year    = new Date().getFullYear();
  const counter = await InvoiceCounter.findOneAndUpdate(
    { year }, { $inc: { seq: 1 } }, { upsert: true, new: true });
  return `INV-${year}-${String(counter.seq).padStart(6, '0')}`;
}
```

| Question | Answer (evidence) |
|---|---|
| Format | `INV-YYYY-NNNNNN`, calendar year, 6-digit zero-padded (`invoiceGenerator.js:26`, schema comment `Invoice.js:5`) |
| Owner | `invoiceGenerator.js` (function is **not exported** — `:239` exports only `generateInvoiceForPayment` / `getOrCreateLegacyInvoices`) |
| Mechanism | Atomic `findOneAndUpdate` + `$inc` with `upsert` on `InvoiceCounter` (`models/InvoiceCounter.js:5-8`, one doc per year, `year` unique) |
| Scope | **Global** — one series for all invoice types, all admins, all customers; no per-entity or per-FY segmentation |
| Uniqueness enforcement | **Both**: DB `unique: true` on `Invoice.invoiceNumber` (`Invoice.js:5`) and `unique: true` on `InvoiceCounter.year` (`InvoiceCounter.js:6`), plus the atomic `$inc` |
| Concurrency-safe? | **Yes for number allocation** — `$inc` in a single atomic document update cannot hand out the same value twice |
| Frontend-generated invoice numbers? | **Yes for marketplace orders** (`AdminDashboard.jsx:4760`, `MyOrders.jsx:31`) — **not** for booking invoices |
| Legacy formats | `isLegacy: true` flag on backfilled rows (`Invoice.js:67`); numbers still come from the same `INV-` series |

### 4.2 Failure / gap behaviour (important for a second series)

- The counter is incremented **before** `Invoice.create`. If `Invoice.create` throws, the number is **consumed and lost (gap)**, and `generateInvoiceForPayment` swallows the error and returns `null` (`invoiceGenerator.js:111-115`) because *"Invoice generation is non-fatal — payments must not be blocked by this"*.
- Consequence: gaps are possible; **duplicates are not** (the `unique` index is the final backstop, `Invoice.js:5`), but a duplicate would surface as a swallowed error → **missing invoice, payment still recorded**. No retry loop exists.
- No MongoDB multi-document transactions/sessions are used anywhere in these flows **[observed]** — booking + ledger + invoice writes are separate `save()`/`create()` calls.

### 4.3 Options for Manual Billing numbering

| Option | Description | Verdict |
|---|---|---|
| **A — one shared series** | Manual invoices continue `INV-2026-000456` | **Not recommended.** Manual and automatic documents become indistinguishable in the register/CSV (`invoice.controller.js:237-254` has no type column today), reconciliation of offline vs gateway cash is impossible, and a single 6-digit global sequence conflates two different controls. |
| **B — separate series, same numbering service** | e.g. `MAN-<FY/YY>-0001`, issued by the *same* atomic `InvoiceCounter` mechanism keyed by `(series, year)` | **Recommended.** Zero risk to the existing series (existing docs/counter rows untouched), identical concurrency guarantees, trivially filterable/searchable, and it makes the manual-vs-automatic distinction visible on the document itself. |
| **C — independent manual counter collection / separate service** | New `ManualInvoiceCounter` model | Acceptable fallback if the team wants hard isolation, but duplicates the counter logic and gives no stronger guarantee than B (both are atomic `$inc`). |

**Why B is safest:** the atomic `$inc` primitive already exists and is already proven; extending the key (adding a `series` discriminator) cannot alter any existing `INV-` document, cannot renumber history, and cannot break `Invoice.invoiceNumber`'s global unique index (the format prefix differs by construction).

**Financial-year boundary [client decision]:** the existing series is **calendar-year** (`new Date().getFullYear()`). A manual series using an Indian FY label (`26-27`) would be *visually* inconsistent with `INV-2026-…` but matches common invoicing practice. Either is implementable in the same counter; this is a naming/business choice, not a technical one. **No GST-compliance claim is made here** — that depends on the registered GSTIN/state configuration, which is itself currently inconsistent (see §12, D7).

**Do not renumber existing invoices** — no migration is required or recommended.

---

## 5. Existing calculation engine and reuse opportunities

### 5.1 What exists

`backend/src/utils/financeUtils.js` declares itself the single source of truth (*"Every GST / commission / tax / pricing calculation in the app MUST go through this module"*, `:1-15`).

| Function | Purpose | Lines |
|---|---|---|
| `roundToPaise(amount)` | 2-dp rounding with `toFixed(4)` float-noise cleanup | `:17-20` |
| `calculatePercentage(base, pct)` | `base × pct / 100`, rounded to paisa | `:23-25` |
| `calculatePricing({...})` | **Pooja/kit booking pricing**: platform fee (percent or fixed), platformGST, kitGST, grandTotal, urgent surcharge | `:48-108` |
| `calculateItemTax(unitPrice, qty, taxRate)` | Marketplace line-item tax | `:111-113` |

Consumers: `booking.controller.js:34-57` (wrapper that loads commission/GST/hike settings), `checkout.controller.js:19-42` (identical wrapper), `refundEngine.js:16`, `admin.controller.js:27`, `kit.controller.js:4`, `poojaLoyaltyService.js:31`.

Client mirror: `frontend/src/utils/priceEngine.js` (`calculatePrice`, `calculateItemTax`, `roundToPaise`) — documented as *"Must mirror the logic in backend/src/utils/financeUtils.js"* (`:2-3`). Booking preview parity is enforced by tests (§15).

### 5.2 Centralized vs duplicated — honest assessment

| Calculation | Centralized? | Evidence |
|---|---|---|
| Pooja/kit/platform/GST totals | ✅ `financeUtils.calculatePricing` | used by both booking and checkout controllers |
| Line-item product tax | ✅ `financeUtils.calculateItemTax` | `checkout.controller.js:171` |
| Refunds | ✅ `refundEngine` (server-recomputed, never trusts client) | `admin.controller.js:1164-1169` |
| Discount/coin distribution across a cart | ⚠️ inline `Math.round(x*100)/100` in controllers | `booking.controller.js:325`, `checkout.controller.js:243,255-260,330-336` — same 2-dp intent but **not** the `toFixed(4)` float-noise-safe `roundToPaise` |
| Marketplace order **displayed** GST | ❌ duplicated + hard-coded | `AdminDashboard.jsx:4763` `total * 0.18 / 1.18`, `MyOrders.jsx:70` "GST @ 18%" — ignores stored per-item `taxRate`/`taxAmount` (`Order.js:10-12`, `checkout.controller.js:180-181`) |
| Invoice GST split (CGST/SGST vs IGST) | ✅ `invoiceGenerator.buildGstBreakdown` (`:30-36`) using `settingsService.get('companyState')` (`:12-16`) | booking invoices only |
| Calculated at view time? | Snapshot on write | totals + `gstBreakdown` are immutable snapshots (`Invoice.js:41-57`), while **line items are re-derived from the live booking** (`invoice.controller.js:9-24`) |

### 5.3 Can Manual Billing reuse this engine?

**Reuse — the safe subset:**
- `roundToPaise`, `calculatePercentage` — generic, no booking assumptions.
- `calculateItemTax(unitPrice, qty, taxRate)` — exactly the product-line tax rule manual product sales need (`Product.taxRate`, `Product.js:27`).
- `buildGstBreakdown` (extract from `invoiceGenerator.js:30-36`) — interstate/intrastate split driven by `companyState`; reusable as-is.
- Server-side re-derivation of totals from submitted line items (the pattern used by `processRefund`: recompute, never trust — `admin.controller.js:1164-1169`).

**Must NOT be inherited (booking-specific):**
- `calculatePricing()` itself — it *always* computes platform commission, platform GST, kit GST, and urgent-hike logic (`financeUtils.js:48-108`). Calling it for a manual product sale would silently charge a platform commission and apply pooja GST-exemption rules (*"Pooja service itself is always GST-exempt"*, `:33`).
- Coupon applicability/eligibility rules for POOJA/KITS (`booking.controller.js:289-308`), coin redemption (`coinRedemptionService`), referral rewards (`userReferralService`), loyalty coins (`poojaLoyaltyService`), urgent-hike settings.
- Refund rule "platform fee is never refunded" (`refundEngine.js:5-8`) — has no meaning for an offline product sale.

**Smallest safe abstraction [inference]:** introduce a pure function (e.g. `calculateManualBillLines(lineItems, { defaultTaxRate }) → { lines, subtotal, totalTax, grandTotal }`) that is built **only** on `roundToPaise`/`calculatePercentage`/`calculateItemTax`, lives beside `financeUtils`, and is called **server-side only** in the manual-billing controller. Client submits `productId + quantity + optional discount` — **never** `unitPrice`, `taxAmount` or `total` (server re-reads `Product.salePrice ?? price` exactly as `checkout.controller.js:156-171` does).

---

## 6. Payment and partial-payment data model

### 6.1 How money is represented today

| Concept | Where stored | Fields |
|---|---|---|
| Invoice total | `Invoice` | `grandTotal`, plus component snapshot (`Invoice.js:42-49`) |
| Amount received (per invoice) | `Invoice.amountPaid` | `Invoice.js:37` |
| Cumulative received before this invoice | `Invoice.previouslyPaid` | `:38` |
| Outstanding after this invoice | `Invoice.outstandingAfter` | `:39` |
| Booking-level truth | `Booking.amountPaid`, `Booking.remainingAmount`, `Booking.paymentStatus` (`PENDING/PARTIALLY_PAID/FULLY_PAID/REFUNDED/FAILED`) | `Booking.js:59-62` |
| Ledger of attempts | `PaymentLedger` (`PENDING/SUCCESS/FAILED`, `paymentType FULL/PARTIAL/REMAINING`) | `PaymentLedger.js:3-16` |
| Attempt history | `Booking.paymentAttempts[]` | `Booking.js:211-222` |
| Refunds | `Booking.refund{}` sub-document | `Booking.js:152-167` |

Payments are **embedded/related, not a general ledger**: there is no double-entry accounting model. `PaymentLedger` is the closest thing to a ledger and is **booking-only**.

### 6.2 Constraints that block naive reuse for offline payments

```js
// PaymentLedger.js:4-8
bookingId:             { type: ObjectId, ref: 'Booking', required: true },
paymentType:           { enum: ['FULL','PARTIAL','REMAINING'], required: true },
merchantTransactionId: { type: String, required: true, unique: true },
phonePeTransactionId:  { default: null },
```
- `merchantTransactionId` is used as the gateway lookup key in `verifyPhonePePayment` (`booking.controller.js:502`), `verifyRemainingPayment` (`:686`), webhook dispatch by prefix `ZUT_REM_` (`:748`), and `retryPayment` in-flight guards (`:573`). Writing offline rows into this collection would put fake identifiers on the same keyspace the gateway code queries.
- `Invoice.paymentGateway` defaults to `'phonepe'` and `generateInvoiceForPayment` hard-codes `paymentGateway: 'phonepe'` (`invoiceGenerator.js:87`) — an offline invoice must never inherit that.

### 6.3 Existing offline-payment precedent (and its gap)

`approvePayLater` (`admin.controller.js:2134-2163`) and `approveCOD` (`:2166-2195`) are the current "admin records an offline outcome" paths: they flip `booking.paymentWorkflow` + `status='paid'`, push `booking.auditLog`, and write an `AdminAuditLog` entry — **but create no `PaymentLedger` row and no `Invoice`.** So today, an offline-settled booking can appear as `paid` while producing no invoice at all.

### 6.4 Recommendation

**Represent a manual/offline payment as a dedicated record, not as a gateway payment:**

1. New collection (e.g. `ManualPayment` / `OfflinePayment`) with: `invoiceId` (required), `amount`, `method` (`CASH|UPI|BANK_TRANSFER|CARD|OTHER`), `receivedAt`, `receivedBy` (admin `User._id`), `note`, `reference` (optional UPI ref / cheque no.), `idempotencyKey` (unique — client-generated per form submit), `status` (`RECORDED`), and an `audit` pointer.
2. **Never** populate `phonePeTransactionId`, never emit gateway-verified states, never call `createPhonePeOrder`/`checkPhonePeStatus`, never write `paymentStatus:'SUCCESS'` into a `PaymentLedger` row that a webhook could later reconcile.
3. Immutability: like `AdminAuditLog` (`AdminAuditLog.js:41-46`), offline payment rows should reject `updateOne/deleteOne` from application code — corrections happen by **recording a new compensating entry** (refund/reversal), not by editing history. **[inference — no such mechanism exists today]**
4. Auditability: every record/cancel action calls `audit(req, { module:'invoice'|'payment', action:'manual_payment_recorded', severity:'critical', … })` exactly as `adminCancelInvoice` (`invoice.controller.js:182-187`) and `processRefund` (`admin.controller.js:1207-1212`) do.
5. Partial offline payments: reuse the *concept* (`amountPaid` / `previouslyPaid` / `outstandingAfter` on the invoice) but the invoice must be re-openable/extended — today one `Invoice` row is one payment (`Invoice.paymentType` enum `FULL|PARTIAL|REMAINING`). **[client decision]** whether a manual bill supports staged payment or is single-payment-only.

---

## 7. Customer, address, product, and inventory relationships

### 7.1 Customers

- `User` (`models/User.js`): `name` required, `phone` **required + strict `/^[6-9]\d{9}$/`** (`:8-13`), `email` optional, roles `user|pandit|admin|system_admin` (`:16`), optional address block (`:34-40`), `savedAddresses[]` (`:51-61`).
- Invoices reference a **real user**: `Invoice.customerId` required (`Invoice.js:10`).
- Booking addresses are a **per-booking snapshot** (`Booking.userDetails`, required name/phone/address/pincode — `Booking.js:12-23`); marketplace addresses are a snapshot too (`Order.shippingAddress`, all fields required — `Order.js:27-35`). Invoice copies the booking snapshot into flat fields (`Invoice.js:19-25`) so later address edits do not alter issued invoices.

**Consequences for Manual Billing [client decision required]:**
- A walk-in customer with no account **cannot** be stored as an `Invoice` without either (a) creating a `User` (requires a valid 10-digit phone, unique index `User.js:121`), or (b) relaxing `customerId` to optional and snapshotting the customer onto the invoice.
- **Recommendation:** make `customerId` optional-but-validated (`source:'manual'` ⇒ embedded `customerSnapshot` mandatory; `source:'booking'` ⇒ `customerId` mandatory), mirroring how `Order.shippingAddress` already stores an immutable snapshot. Do not auto-create `User` accounts for walk-ins without an explicit business decision (it affects referral/wallet/notification surfaces).

### 7.2 Products, catalog, stock

- `Product` (`models/Product.js`): `price`, `salePrice`, `stock`, `variants[]` (`variantId/quantity/price/salePrice/stock/isActive`), `taxRate` (0-100), `isActive`, `isDeleted`, `visibilityType`.
- `Kit` (`models/Kit.js`): bundles of `productId+variantId+quantity`, `discountPrice`, `taxRate` — kits are only sold **inside pooja bookings** today (`resolveKitsPrice`, `booking.controller.js:64-70`).
- Stock rules already enforced server-side at checkout: variant stock check + `unitPrice = variant.salePrice ?? variant.price ?? product.salePrice ?? product.price` (`checkout.controller.js:156-171`).
- Inventory mutation: `deductStock(orderItems, orderId, updatedBy)` / `restoreStock(...)` — atomic `$inc`, variant-aware, writes an `InventoryLog` row per item (`inventoryUtils.js:10-52`, `:58-98`). Reasons observed: `order_paid | order_cancelled | order_refunded | admin_edit` (`InventoryLog.js:9`).
- Stock is only deducted **after payment success** (`checkout.controller.js:443`, `:514`) — an offline sale should mirror that: deduct on invoice finalization, restore on cancellation via `restoreStock`.

**Existing behaviour to preserve:** variant-aware atomic `$inc`, an `InventoryLog` row for every change, and stock never silently going negative at the *validation* step (deduction itself is unguarded `$inc`, which is why the pre-check exists).

### 7.3 Smallest data-model extension (no migrations)

Do **not** add fields to `Product`, `User`, or `Kit`. Extend only:
1. `Invoice`: add `source: enum ['booking','manual']` (default `'booking'` so every existing row is unchanged), relax `bookingId`/`bookingNumber` to be conditionally required (required only when `source==='booking'`), add `lineItems[]` snapshot (`name, productId?, variantId?, hsn?, quantity, unitPrice, discount, taxRate, taxAmount, total`), add `manualBillNumber`-agnostic fields already present (`customer*`, `grandTotal`, `gstBreakdown`, `outstandingAfter`).
2. New `OfflinePayment` collection (§6.4).
3. Optionally a `ManualSale`/`Order.source` link if inventory must be tied to a document (see §10 Q6).

Mongoose `required` changes validate on `save()` only and do **not** rewrite existing documents — no migration, no historical alteration. **[inference — consistent with observed Mongoose behaviour]**

---

## 8. Invoice PDF and lifecycle

### 8.1 Storage & schema recap

`Invoice` (`models/Invoice.js`): identity (`invoiceNumber`), relationships (`bookingId`, `paymentLedgerId`, `customerId`), customer snapshot, `invoiceDate`, payment type/gateway/txn ids, amount breakdown, totals + `gstBreakdown`, lifecycle `status: active|cancelled|archived`, `isLegacy`, audit (`generatedBy: 'system'|'admin'|'migration'`, `ipAddress`, `invoiceVersion`), cancellation record (`cancelledAt/By/Reason`), `timestamps`. Indexes: `bookingId`, `customerId+createdAt`, `paymentLedgerId`, `invoiceDate`, `status`, `bookingNumber`, txn ids (`:80-87`).

**Missing for manual billing:** line items (§7), source/type discriminator, creator identity for manual bills (`generatedBy` exists but is a free string), draft state (there is **no draft status** — an invoice is created final).

### 8.2 PDF / printable output — three independent renderers, none server-side

| Surface | Mechanism | Data source |
|---|---|---|
| `frontend/src/pages/InvoicePage.jsx` (routes `/invoice/view/:invoiceNumber`, `/invoice/:bookingId` — `App.jsx:140,143`) | React DOM + `window.print()` (`:408`), tuned `@media print` CSS (`:128-139`) | `GET /api/invoices/number/:invoiceNumber` → `{ invoice, booking }`; requires a **booking** (`invoice.controller.js:68`) |
| `AdminDashboard.jsx:4755-4878` and `MyOrders.jsx:21-78` | `window.open` + raw HTML string + `window.print()` | live `Order` (no `Invoice`), client-built number + hard-coded 18% |
| `mobile-app/.../InvoiceScreen.jsx` | `expo-print` `printToFileAsync({html})` → share PDF (`:141-143`) | `/bookings/:id/invoice` or `/marketplace/orders/:id/invoice` |

- Branding: dynamic platform logo from settings (recent commit `ffb26bb` "added dynamic logo on invoice"), legal identity from `frontend/src/config/company.config.js` (hard-coded `gstin: '07AACCZ8054C1ZB'`, `state: 'Delhi'`) while backend uses `COMPANY_GSTIN=09AAAFZ1234Z1Z5` + `settingsService.get('companyState')` — **two different sources** (see §12 D7).
- No server-side PDF generation dependency exists (`backend/package.json` has no pdf/puppeteer library).

### 8.3 Download / preview / search / admin control

- Search, filters (status, paymentType, gateway, date range), pagination, stats, monthly revenue, CSV export: `invoice.controller.js:98-264`; UI `InvoicesTab` (`AdminDashboard.jsx:9830-10140`).
- Access control: user routes `invoice.routes.js:5-10` (`protect` + ownership/admin check at `invoice.controller.js:41,64`); admin routes under `admin.routes.js:15` (`protect, authorize('admin')`) at `:146-149`.
- Cancellation/archival is soft, audited, and never destructive (`invoice.controller.js:167-211`); the UI copy states *"Invoices are never deleted"* (`AdminDashboard.jsx:10128`).

### 8.4 Duplicate generation & idempotency today

- Per-ledger guard (`invoiceGenerator.js:55-58`) + webhook ledger-state guard (`booking.controller.js:794`).
- Legacy path first returns existing rows (`:127-128`).
- `GET` endpoints never create invoices unless the legacy backfill branch fires.
- **No idempotency key at the API level** — a manual-billing POST retried by an impatient admin would double-bill unless a client-supplied idempotency key is enforced (unique index) **[recommended]**.

### 8.5 Can one model + template serve both?

**Model: yes, with the extensions in §7.3.** The generic parts (customer snapshot, totals, GST split, lifecycle, cancel/archive, admin list/export, search) are all source-agnostic today; only `bookingId`/`bookingNumber` requiredness and the absence of line items block it.

**Template: yes, after one refactor.** `InvoicePage.jsx` currently mixes snapshot fields with live-booking fallbacks (`resolvePricing(invoice || b)` `:364`, `:369-384`). The safe change is to have the API return a **normalized view-model** (`{ invoice, lines[], customer, totals, payment }`) for both sources, and have the renderer consume only that — then manual invoices need no booking at all. Rendering remains print-based; **no new PDF implementation is required** (and duplicating the HTML builders a fourth time — `AdminDashboard`, `MyOrders`, mobile, `InvoicePage` — is exactly the drift that already produced the hard-coded 18% bug).

**Corrections:** reuse soft-cancel + archive + a **new credit-note/negative-adjacent record** if business requires it — there is currently **no** credit-note mechanism anywhere **[observed gap]**. Never edit or delete issued documents (schema comment `Invoice.js:60`; UI copy `AdminDashboard.jsx:10128`).

---

## 9. Security and concurrency considerations

| # | Risk | Current protection (evidence) | Recommended safeguard for Manual Billing |
|---|---|---|---|
| S1 | Unauthorized admin access | `protect` + `authorize('admin')` on the whole admin router (`admin.routes.js:15`), `system_admin` implicit superset (`auth.js:78-87`), admin sessions validated (`auth.js:34-42`) | Mount manual-billing routes **inside** `admin.routes.js`; consider `authorize('admin','system_admin')` + explicit `isAdminRole` checks. If finer control is needed, role granularity is limited — only 4 roles exist (`User.js:16`) **[client decision]** |
| S2 | Client-controlled price/total | Server-authoritative pricing everywhere; refund recomputed server-side (`admin.controller.js:1164-1169`); urgent test #47 proves body-supplied totals are ignored (`urgent-pricing.test.js` "#47") | Server re-reads `Product` price + `taxRate`, recomputes every line and the grand total; **reject** any submitted `total/taxAmount/unitPrice` (or overwrite silently) |
| S3 | Duplicate invoice numbers under concurrency | Atomic `$inc` (`invoiceGenerator.js:21-25`) + `unique` on `invoiceNumber` (`Invoice.js:5`) | Same counter service keyed by series; keep the unique index as backstop |
| S4 | Duplicate invoice/payment after retries | Per-ledger idempotency (`invoiceGenerator.js:55-58`); webhook ledger-state guard (`booking.controller.js:794`) | Unique `idempotencyKey` on the offline payment + idempotent invoice-create guard on `(source, idempotencyKey)`; return the existing document on replay |
| S5 | Inconsistent totals vs balances | Amounts snapshotted at generation (`Invoice.js:41-57`); `previouslyPaid/outstandingAfter` derived (`invoiceGenerator.js:66-67`) | Derive `outstandingAfter` server-side from persisted totals; never accept it from the client |
| S6 | Unauthorized change of finalized invoices | No edit endpoint exists; only soft cancel/archive with audit (`invoice.controller.js:167-211`) | Keep it that way: manual invoices are immutable after finalize; corrections = new record |
| S7 | Incorrect inventory adjustment | Pre-check + atomic `$inc` + `InventoryLog` (`inventoryUtils.js`) | Deduct only on finalize, once (idempotency), restore via `restoreStock` on cancel |
| S8 | Fake/gateway-forged payments | Webhook checksum verification (`verifyWebhookChecksum`, `booking.controller.js:735`), mock router unmounted unless `PAYMENT_MODE=mock` (`app.js:182-186`) | Offline payments live in a separate collection with `channel:'offline'`, `method`, `receivedBy`; **never** write `phonePeTransactionId` or `paymentStatus:'SUCCESS'` on a gateway row |
| S9 | PDF ≠ persisted record | Booking invoice renders from snapshot + live booking; order invoice renders from live order with client math | Render from a normalized snapshot returned by the server; the printed number must come from `Invoice.invoiceNumber` only |
| S10 | Triggering booking/referral/wallet/gateway side effects | Those live in booking/checkout controllers, not in `invoiceGenerator` (it only writes Invoice + back-links ledger) | Manual-billing controller must call **none** of: `createPhonePeOrder`, `coinRedemptionService`, `couponService.recordRedemption`, `userReferralService`, `poojaLoyaltyService`, `NotificationEngine` booking events — unless explicitly approved |
| S11 | Cross-role leakage of financial data | `isAdminRole` checks (`invoice.controller.js:41,64`); admin list returns only to admins | Keep manual invoices out of other users' `/invoices/my`; avoid logging full customer payloads (existing code logs only `err.message`, `invoiceGenerator.js:113`) |
| S12 | Counter consumed by failed insert (gap) | Swallowed error, non-fatal by design (`invoiceGenerator.js:111-115`) | Accept gaps (normal for invoice series) or retry `Invoice.create` once; **never** re-use a number |
| S13 | Audit trail tampering | `AdminAuditLog` rejects updates/deletes (`AdminAuditLog.js:41-46`), `audit()` is the single write path (`auditService.js:37-65`) | Use `audit()` for every manual-billing mutation (`create/finalize/cancel/payment`) |
| S14 | Rate limiting / input validation | Global `apiLimiter` + `authLimiter` (`app.js:76-87`), `helmet` (`:31`), `express-validator` available but **not used** on invoice routes | Add explicit validation on the manual-billing endpoints (quantities ≤ caps, positive amounts, allowed methods) |

**Note on `merchantTransactionId` prefix conventions observed:** `ZUT_` (initial), `ZUT_RETRY_`, `ZUT_REM_`, `ZUT_CART_` — all gateway-bound. Any offline identifier must use a distinct, gateway-never-generated namespace (e.g. `OFF_`) **and** must not be written into `PaymentLedger` at all (preferred).

---

## 10. Recommended Manual Billing architecture

### Q1 — Invoice numbering: separate series?
**Yes — separate manual series (Option B).** Facts: the current series is global and calendar-year (`invoiceGenerator.js:19-27`), has no type discriminator in data or CSV export (`invoice.controller.js:229-254`), and one number space serves all contexts. A distinct prefix (illustrative only: `MAN-…`) makes offline vs gateway revenue separable at a glance, requires **no** change to existing numbers, and satisfies the "recognisable manual series" requirement. **[client decision]** on the exact format and on calendar-year vs financial-year segment.

### Q2 — Numbering service: one shared, concurrency-safe service?
**Yes.** Reuse the exact `InvoiceCounter` atomic `findOneAndUpdate + $inc` pattern, keyed by `(series, year)` instead of `year` alone (add an optional `series` field defaulting to `'INV'` + compound unique index, or use a separate counter document namespace). Existing counter documents and all `INV-` invoices remain untouched. Uniqueness remains backed by `Invoice.invoiceNumber`'s global unique index (`Invoice.js:5`). Do **not** use `countDocuments()`-style generation (the `Booking.js:240` / `Order.js:94` pattern is race-prone and must not be copied).

### Q3 — Calculation reuse
- **Reuse:** `roundToPaise`, `calculatePercentage`, `calculateItemTax`, `buildGstBreakdown`, plus the *pattern* of server-authoritative re-derivation (`processRefund`, `checkout.controller.js:156-171`).
- **Keep separate:** `calculatePricing()` (platform commission + platform GST + kit GST + pooja GST-exemption + urgent hike), coupon applicability/eligibility, coin redemption, referral/loyalty rewards, `refundEngine`'s "platform fee non-refundable" rule, and all `settingsService` booking-price keys.
- Ship a small `calculateManualBillLines()` that depends only on the generic primitives, and recompute everything server-side from `productId + quantity (+ optional line discount)`.

### Q4 — Data model (with code evidence)
**Extend the existing `Invoice` model + add a dedicated offline-payment collection.** Evidence:
- `Invoice` already owns everything manual billing needs: customer snapshot (`Invoice.js:19-25`), totals + GST split (`:42-57`), lifecycle `active|cancelled|archived` (`:61-65`), `generatedBy: 'system'|'admin'|'migration'` (`:70`), cancellation audit (`:75-77`), global unique number (`:5`), and the full admin read/cancel/archive/export surface (`invoice.controller.js:98-264`).
- Blocking facts: `bookingId` `required: true` (`:8`) and `bookingNumber` `required: true` (`:13`), and **no line items** — so both must be added/relaxed for `source:'manual'`.
- Payments must **not** reuse `PaymentLedger` (`bookingId` required, `merchantTransactionId` unique & gateway-interrogated — `PaymentLedger.js:4-8`), and must not reuse `Invoice.paymentGateway` (defaults/forces `'phonepe'`, `Invoice.js:32`, `invoiceGenerator.js:87`).
- Creating a wholly separate `ManualInvoice` model would duplicate the admin register, CSV export, search, cancellation and audit code that already exists and is generic.

### Q5 — Payment tracking without fabricating gateway transactions
New `OfflinePayment` collection (§6.4): `{ invoiceId, amount, method: CASH|UPI|BANK_TRANSFER|CARD|OTHER, reference, receivedAt, receivedBy, note, idempotencyKey(unique), status, timestamps }`, write-protected like `AdminAuditLog`, every action audited via `audit()` with `severity:'critical'`. Populate `Invoice.amountPaid / previouslyPaid / outstandingAfter / paymentType` from these records, and set `paymentGateway:'offline'` (new enum value) with **empty** `merchantTransactionId`/`gatewayTransactionId`. Never call or imitate PhonePe.

### Q6 — Product inventory
Preserve exactly: server-side price lookup (`salePrice ?? price`), variant availability pre-check, atomic variant-aware `$inc`, `InventoryLog` row per change (`inventoryUtils.js:10-52`). Deduct **once** on finalization, restore with `restoreStock(..., 'order_cancelled'|'order_refunded', ...)` on cancellation. `InventoryLog.orderId` currently references `Order` (`InventoryLog.js:10`) **[client decision]** whether to (a) relax it to a generic reference, (b) create an `Order` row with `source:'manual'` (requires touching `Order.paymentProvider` enum, `Order.js:60`, and the race-prone `orderNumber` hook), or (c) skip stock management for offline sales initially.

### Q7 — Invoice finalization / corrections
Finalize = immutable record (existing model has no draft state, so either add `status:'draft'` **[client decision]** or create the invoice only at finalize time — recommended: create only at finalize, keeping "no partial documents"). Corrections = existing soft `cancel` (reason + `cancelledBy` + audit, `invoice.controller.js:167-191`) or `archive`, plus an optional future **credit note** entity linked to the original `invoiceId`. **Never** edit or delete a finalized invoice (consistent with `Invoice.js:60` and the UI copy at `AdminDashboard.jsx:10128`). Gap to note: booking cancellation does not cascade to invoices (§3.5).

### Q8 — PDF generation
**Yes, safely, after one refactor.** Add a server endpoint returning a normalized invoice view-model (`invoice + lines + customer + totals + payments`) for both `source:'booking'` and `source:'manual'`, and render it in `InvoicePage.jsx` (web) — the existing print CSS and branding stay. Do **not** add a fourth HTML builder; do not add a server PDF dependency. Also plan to route the marketplace order printers through the same view-model later to remove the hard-coded 18% drift (out of scope for Manual Billing itself).

### Q9 — Admin UI placement
- **Entry point:** new sidebar item next to Invoices — `frontend/src/components/layout/Sidebar.jsx:79` (`/admin?tab=invoices`) → add `path: '/admin?tab=manual-billing'`, mounted in `AdminDashboard.jsx` where tabs are switched (`AdminDashboard.jsx:82-108`, add `{tab === 'manual-billing' && <ManualBillingTab />}`).
- **Alternative:** an action button inside `InvoicesTab` (`AdminDashboard.jsx:9830`) — good for discoverability, but a separate tab keeps the register read-only and avoids mixing a large form into a table screen.
- **Recommended workflow (UI):** 1) open Manual Billing → 2) search existing customer (`GET /api/admin/users` exists, `admin.routes.js:45`) **or** enter walk-in details → 3) add catalog products (`GET /api/admin` product endpoints / marketplace tab) with quantity/variant → 4) server returns computed lines (prices/tax read-only) → 5) review totals → 6) record amount received + method (+ optional reference/idempotency key) → 7) finalize → 8) open `/invoice/view/:invoiceNumber` for preview/print → 9) find it later in the existing Invoices register (add a `source` filter column) with payment history from the offline-payment list.
- **Backend endpoints (proposed, not created):** under `admin.routes.js` (inherits `protect + authorize('admin')`): `POST /api/admin/manual-billing/preview`, `POST /api/admin/manual-billing/invoices`, `GET /api/admin/manual-billing/invoices/:id/payments`, `POST /api/admin/manual-billing/invoices/:id/payments` (additional offline receipts), `POST /api/admin/manual-billing/invoices/:id/cancel` (or reuse the existing cancel route).

### Q10 — Implementation sequence (minimal risk)
See §13.

---

## 11. Invoice numbering recommendation (summary)

| Decision | Recommendation |
|---|---|
| Separate manual series? | **Yes** — distinct prefix from `INV-` (format = client decision) |
| Shared numbering service? | **Yes** — same atomic `InvoiceCounter` `$inc` pattern keyed by `(series, year)` |
| Existing invoices | **Untouched** — no renumbering, no migration |
| Uniqueness | Keep `Invoice.invoiceNumber` global `unique` index (`Invoice.js:5`) |
| Frontend numbering | **Forbidden** for manual billing; number minted server-side immediately before create (mirrors `invoiceGenerator.js:60`) |
| Failed inserts | Gaps acceptable (numbers are consumed, never reused); optional single retry, never reuse |
| Compliance | **No GST/series-compliance claim made** — depends on client's registered GSTIN/state configuration, which is currently inconsistent (§12 D7) |

---

## 12. Required client decisions and unresolved requirements

| # | Decision | Why it blocks implementation |
|---|---|---|
| **D1** | Exact manual invoice number format & whether the segment is calendar year (like `INV-2026-`) or Indian FY (`26-27`) | Counter key design + template label |
| **D2** | Walk-in customers: create `User` accounts, or store snapshot-only invoices (`customerId` optional)? | `Invoice.customerId` required (`Invoice.js:10`), `User.phone` required + strict validator (`User.js:8-13`) |
| **D3** | Tax treatment for offline product sale: per-product `taxRate` (as marketplace does, `checkout.controller.js:171`), a single default rate, or GST-exempt? And CGST/SGST vs IGST source of truth (`companyState`, `invoiceGenerator.js:12-16`) | Determines the calculation function and the `gstBreakdown` written |
| **D4** | Are discounts allowed on manual bills (line-level, bill-level)? Are coupons/coins allowed? (**Recommend: no coupons/coins** — they pull in `couponService`/`coinRedemptionService` booking rules) | Line schema + calculation function |
| **D5** | Payment methods accepted (Cash / UPI / Bank Transfer / Card) and whether partial/staged offline payment is allowed | `OfflinePayment.method` enum + invoice balance semantics |
| **D6** | Does an offline product sale decrement stock? And which document `InventoryLog` links to (`InventoryLog.orderId` refs `Order`) | §10 Q6 options (a)/(b)/(c) |
| **D7** | **GSTIN / registered-state source of truth** — frontend hard-codes `07AACCZ8054C1ZB` / `state:'Delhi'` (`frontend/src/config/company.config.js:6-13`) while backend env default is `09AAAFZ1234Z1Z5` (`backend/src/config/company.config.js:11`) and `companyState` defaults to UP (`invoiceGenerator.js:10`). These disagree, and they decide IGST vs CGST/SGST | Printed invoice correctness; must be resolved before any new invoice type is printed |
| **D8** | Correction policy for manual invoices: cancel-only, or cancel + credit note? Does cancelling a manual invoice reverse stock? | §10 Q7; no credit-note model exists today |
| **D9** | Should manual invoices be visible to the customer in `/invoices/my` and `/invoice/view/:…`, or admin-only? | `invoice.controller.js:76-91, 59-72` ownership checks assume a customer `User` |
| **D10** | Authorization granularity: any admin, or `system_admin` only? (only 4 roles exist, `User.js:16`) | Route decorator choice |
| **D11** | Whether manual bills may contain non-catalog (free-text) line items, and HSN/SAC requirements | Line-item schema |
| **D12** | Whether offline sales should appear in existing revenue stats (`invoice.controller.js:146-152` month revenue sums `Invoice.amountPaid`) — mixing offline + gateway revenue may be desired or not | Stats query needs a `source` filter |

---

## 13. Proposed implementation phases

> None of these phases has been started. Approval required before Phase 1.

| Phase | Content | Risk |
|---|---|---|
| **0. Decisions** | Resolve D1–D12 (esp. D7 GSTIN/state, D2 walk-ins, D6 stock) | — |
| **1. Numbering** | Add `series` support to the counter service (`invoiceGenerator`-owned function exported for reuse); unit-test atomicity + format; **zero change** to existing `INV-` issuance | Very low — additive |
| **2. Model** | Add `Invoice.source` (default `'booking'`), `Invoice.lineItems[]`, conditional requiredness for `bookingId`/`bookingNumber`/`customerId`; add `paymentGateway:'offline'` allowance; **no data migration** | Low — additive; verify existing invoice tests still pass |
| **3. Offline payment** | New `OfflinePayment` model with unique `idempotencyKey`, write-protection, and `audit()` hooks | Low — new isolated collection |
| **4. Calculation** | `calculateManualBillLines()` beside `financeUtils`, built only on `roundToPaise/calculatePercentage/calculateItemTax` + `buildGstBreakdown`; server-side re-derivation only | Low — no existing code touched |
| **5. API** | `admin.routes.js` endpoints (preview/create/list payments/cancel) with validation, idempotency, audit; optional `deductStock` integration per D6 | Medium — new surface |
| **6. UI** | `ManualBillingTab` + sidebar entry; reuse `InvoicesTab` filters with a `source` column; preview/print through `/invoice/view/:invoiceNumber` | Medium |
| **7. Rendering** | Server returns normalized invoice view-model; `InvoicePage.jsx` branches on `source` (no booking) — shared template, no new PDF tech | Medium — touches an existing user-facing page, so regression-test booking invoices |
| **8. Hardening** | Tests mirroring `urgent-pricing.test.js` style (numbering concurrency, idempotent create, totals recomputation, inventory on/off, cancellation immutability, no gateway side effects) | — |

Each phase is independently shippable and leaves existing automatic billing behaviour byte-for-byte unchanged; phases 1–4 require no frontend deployment.

---

## 14. Exact files likely to be modified in the future

| File | Purpose | Expected change |
|---|---|---|
| `backend/src/models/Invoice.js` | Add `source`, `lineItems[]`, conditional requiredness, `paymentGateway` offline value | Additive schema |
| `backend/src/models/InvoiceCounter.js` | Add `series` (compound unique with `year`) | Additive schema |
| `backend/src/utils/invoiceGenerator.js` | Export a series-aware `generateInvoiceNumber(series)`; keep existing behaviour for `'INV'` | Additive refactor |
| **new** `backend/src/utils/manualBillCalculator.js` (or similar) | Server-side line/tax/total computation | New file |
| **new** `backend/src/models/OfflinePayment.js` | Offline payment records | New model |
| **new** `backend/src/controllers/manualBilling.controller.js` | Preview / create / list / cancel | New controller |
| `backend/src/routes/admin.routes.js` | Register manual-billing routes (already behind `protect + authorize('admin')`, `:15`) | Add routes |
| `backend/src/utils/inventoryUtils.js` | Only if a generic reference/link parameter is needed for `InventoryLog` (D6) | Optional |
| `backend/src/models/InventoryLog.js` | `orderId` reference generalization (D6) | Optional |
| `backend/src/controllers/invoice.controller.js` | `source` filter in admin list/search/export; view-model endpoint | Small additions |
| `frontend/src/pages/AdminDashboard.jsx` | New `ManualBillingTab`; mount at `:82-108`; add `source` column in `InvoicesTab` (`:10008`) | New component + small edits |
| `frontend/src/components/layout/Sidebar.jsx` | New nav entry (next to `:79`) | 1 line |
| `frontend/src/App.jsx` | Only if a dedicated route is preferred over `?tab=` | Optional |
| `frontend/src/pages/InvoicePage.jsx` | Render manual invoices from normalized view-model (no booking) | Branch + data-source change |
| `frontend/src/i18n/locales/*.json` (13 files) | Sidebar/tab labels | Additive |
| `mobile-app/src/screens/user/InvoiceScreen.jsx` | Only if manual invoices are customer-visible (D9) | Optional |
| `backend/tests/*.test.js` | New test file(s) for numbering, manual bill math, idempotency, offline payments | New tests |

**Files explicitly NOT to be modified:** `utils/phonepe.js`, `payment.config.js`, webhook handlers, `PaymentLedger` schema, `financeUtils.calculatePricing`, `refundEngine`, coupon/coin/referral/wallet services, existing invoice numbers/data.

---

## 15. Existing tests and checks actually executed

Runner: `node --test` (`backend/package.json` → `"test": "node --test"`), executed from `backend/` against a local MongoDB (`mongodb://127.0.0.1:27017`). **These are the only commands executed; results below are real outputs, not claims.**

| Command | Result |
|---|---|
| `node --test tests/payment-mode.test.js` | **65 passed / 0 failed** (8 suites, ~52.7s) — booking/payment lifecycle in mock mode, payment-verification ownership, cross-worker mock state |
| `node --test tests/urgent-pricing.test.js` | **49 passed / 0 failed** (13 suites, ~5.8s) — includes `#31` invoice snapshot of the surcharge, `#32` **invoice idempotency + breakdown sums to grand total**, `#47` client cannot override totals, `#49` authoritative amount flows to payment/invoice |
| `node --test tests/coupon-system.test.js` | **26 passed / 0 failed** |
| `node --test tests/coin-redemption.test.js` | **19 passed / 0 failed** — includes settlement idempotency across verify+webhook |
| `node --test tests/razorpay-deactivation.test.js` | **6 passed / 0 failed** — confirms legacy Razorpay routes return 410 and live PhonePe endpoints remain |
| `node --test tests/admin-phase3.test.js` | **30 passed / 0 failed** |
| `git status` (before and after) | clean — no repository changes other than this document |
| Node/Mongo connectivity probe | `MONGO_OK` (local mongod reachable) |

**Total: 195 tests passed, 0 failed.**

**Not executed (explicitly):** the remaining ~22 test files (not billing-related), the frontend build/lint (`react-scripts build`, no `lint` script defined in `frontend/package.json`), backend has no `lint`/`typecheck` script, and **no manual invoice, no fake payment record, no database migration, and no production/financial data was touched**. Test databases used by the suites are dropped by their own `after()` hooks.

---

## 16. Risks, limitations, and compatibility considerations

1. **Booking-coupled schema** — `Invoice.bookingId`/`bookingNumber` are `required`, and `GET /api/invoices/number/:invoiceNumber` always loads a booking (`invoice.controller.js:68`). Without the §7.3 change, a manual invoice cannot exist or be rendered.
2. **No line-item snapshot** — issued booking invoices re-read live booking data; a manual invoice has nothing to re-read. Line items must be snapshotted at creation or the printed document can drift from what was charged.
3. **Gateway-shaped payment model** — `PaymentLedger` cannot represent offline money safely (unique gateway key + booking FK + webhook queries). Attempting reuse risks reconciliation collisions.
4. **`paymentGateway` semantics** — `'phonepe'` is a schema default (`Invoice.js:32`) and is hard-coded in generation (`invoiceGenerator.js:87`); forgetting to override it would label offline cash as PhonePe.
5. **Stats/revenue contamination** — admin revenue aggregates sum `Invoice.amountPaid` with no source filter (`invoice.controller.js:138-152`); manual invoices will merge into "gateway revenue" unless filtered (D12).
6. **Marketplace invoices are outside the register** — orders' printed invoices are client-side with hard-coded 18% GST (`AdminDashboard.jsx:4763`, `MyOrders.jsx:70`) and client-built numbers (`:4760`, `MyOrders.jsx:31`). Manual billing must not copy this pattern; it is a pre-existing correctness/consistency risk.
7. **GSTIN/state inconsistency** — frontend `07…Delhi` vs backend `09…UP` (D7). IGST vs CGST/SGST on any printed document depends on resolving this.
8. **No credit-note/amendment model** — only soft cancel/archive; refunds live on `Booking`, and booking cancellation does not cascade to invoices (§3.5).
9. **No draft state / no API idempotency key** — a retried POST would create two invoices unless an idempotency key is enforced.
10. **No Mongo transactions** — invoice, ledger and booking writes are independent; a manual-billing create must be designed to fail atomically (single-document create, or explicit cleanup) **[inference]**.
11. **Number gaps on failure** — by design (`invoiceGenerator.js:111-115`); harmless but should be documented for finance users.
12. **Race-prone sibling numbering** — `Booking.js:238-244` and `Order.js:92-98` use `countDocuments()`; do **not** imitate them for manual invoices.
13. **Authorization granularity** — only 4 roles; `authorize('admin')` grants every admin the power to issue financial documents (D10) plus per-action `AdminAuditLog` rows.
14. **i18n surface** — 13 locale files need new keys for any new UI strings.
15. **Print-only PDF** — output depends on the browser/OS print dialog; no server-rendered PDF exists to archive automatically.
16. **Compatibility guarantee** — nothing in this audit changes existing behaviour; all recommendations are additive (`source` defaults to `'booking'`, new collections, new routes), and the existing 195 passing tests are the regression baseline for the future implementation.

---

*End of audit. No application code, schema, configuration, payment state, or data was modified. The only repository change is this file.*
