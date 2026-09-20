# All Transactional Email Templates — Bootstrap Report

Generated: 2026-09-20T05:20:45.809Z
Mode: **apply**
Script version: 1.0.0
Database: zutsav @ localhost

## Summary

| Action | Count |
| --- | --- |
| `ALREADY-CORRECT` | 25 |
| `SKIPPED-BLOCKED` | 3 |
| `SKIPPED-NOT-REACHABLE` | 11 |
| `SKIPPED-NOT-VERIFIED` | 6 |

## Approved mappings (applied set)

| Event | Recipient | Purpose | Action | Mapping id | Emitter |
| --- | --- | --- | --- | --- | --- |
| `BOOKING_CONFIRMED` | user | BOOKING | `ALREADY-CORRECT` | 6aae7b87a77e799e18bfe655 | src/controllers/booking.controller.js onPaymentSuccess (booking.controller.js:131) |
| `PAYMENT_SUCCESS` | user | BOOKING | `ALREADY-CORRECT` | 6aae7b87a77e799e18bfe65b | src/controllers/booking.controller.js onPaymentSuccess (booking.controller.js:130) |
| `SERVICE_REMINDER_24H` | user | BOOKING | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad23e6 | src/utils/cleanupJobs.js run24hReminder (cleanupJobs.js:103) |
| `SERVICE_REMINDER_1H` | user | BOOKING | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad23e9 | src/utils/cleanupJobs.js run1hReminder (cleanupJobs.js:156) |
| `INVOICE_GENERATED` | user | BOOKING | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad23ec | src/utils/cleanupJobs.js runInvoiceJob (cleanupJobs.js:210); src/controllers/admin.controller.js:1867,1928; src/controllers/booking.controller.js:1130 |
| `BOOKING_CANCELLED` | user | BOOKING | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad23ef | src/controllers/booking.controller.js:952 (customer); src/controllers/admin.controller.js:1833 (admin) |
| `PARTIAL_PAYMENT_RECEIVED` | user | BOOKING | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad23f2 | src/controllers/booking.controller.js onPartialPaymentSuccess (booking.controller.js:137) |
| `FINAL_PAYMENT_RECEIVED` | user | BOOKING | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad23f5 | src/controllers/booking.controller.js onFinalPaymentSuccess (booking.controller.js:142) |
| `PAYMENT_FAILED` | user | BOOKING | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad23f8 | src/utils/paymentAttempts.js recordAttemptResult (paymentAttempts.js:47) |
| `BOOKING_REFUNDED` | user | BOOKING | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad23fb | src/controllers/admin.controller.js:1197,1857 |
| `ORDER_CONFIRMED` | user | ORDER | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad23fe | src/controllers/admin.controller.js updateOrderStatus (admin.controller.js:2198 via ORDER_CONFIRMED) |
| `ORDER_DELIVERED` | user | ORDER | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad2401 | src/controllers/admin.controller.js:2198,2622,2691,3280 |
| `ORDER_REFUNDED` | user | ORDER | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad2404 | src/controllers/admin.controller.js updateOrderStatus (admin.controller.js:2198 via ORDER_REFUNDED) |
| `KIT_SHIPPED` | user | ORDER | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad2407 | src/controllers/admin.controller.js:3093,3133 |
| `ACCOUNT_DELETED` | user | ACCOUNT | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad240a | src/utils/cleanupJobs.js performDeletionCleanup (cleanupJobs.js:51) |
| `ACCOUNT_DELETION_CANCELLED` | user | ACCOUNT | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad240d | src/controllers/admin.controller.js cancelAccountDeletion (admin.controller.js:903) |
| `ACCOUNT_RESTORED` | user | ACCOUNT | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad2410 | src/controllers/auth.controller.js cancelAccountDeletion (auth.controller.js:687) |
| `PANDIT_APPROVED` | pandit | ACCOUNT | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad2413 | src/controllers/admin.controller.js updatePanditStatus (admin.controller.js:630) |
| `KYC_APPROVED` | pandit | ACCOUNT | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad2416 | src/controllers/admin.controller.js updateKYCStatus (admin.controller.js:662) |
| `KYC_REJECTED` | pandit | ACCOUNT | `ALREADY-CORRECT` | 6aaf6c0dbd6d642287ad2419 | src/controllers/admin.controller.js updateKYCStatus (admin.controller.js:670) |
| `KYC_REUPLOAD_REQUIRED` | pandit | ACCOUNT | `ALREADY-CORRECT` | 6aaf6c0ebd6d642287ad241c | src/controllers/admin.controller.js updateKYCStatus (admin.controller.js:678) |
| `PANDIT_POOJA_REQUEST_CREATED` | pandit | SERVICE | `ALREADY-CORRECT` | 6aaf6c0ebd6d642287ad241f | src/controllers/poojaRequest.controller.js (poojaRequest.controller.js:107) |
| `PANDIT_POOJA_APPROVED` | pandit | SERVICE | `ALREADY-CORRECT` | 6aaf6c0ebd6d642287ad2422 | src/controllers/poojaRequest.controller.js (poojaRequest.controller.js:204) |
| `PANDIT_POOJA_REJECTED` | pandit | SERVICE | `ALREADY-CORRECT` | 6aaf6c0ebd6d642287ad2425 | src/controllers/poojaRequest.controller.js (poojaRequest.controller.js:255) |
| `PANDIT_ASSIGNMENT_PENDING` | pandit | SERVICE | `ALREADY-CORRECT` | 6aaf6c0ebd6d642287ad2428 | src/controllers/admin.controller.js assignPandit (admin.controller.js:1760) |

## Blocked (never auto-created)

| Event | Recipient | Reason |
| --- | --- | --- |
| `CAMPAIGN_COUPON` | user | Marketing communication. Email marketing consent/unsubscribe infrastructure is not implemented, and campaignService.validateChannel hard-blocks the email channel for campaigns. |
| `OTP_VERIFICATION` | pandit | Intentionally disabled dead mapping (disableDeadPanditEmailMappings.js). Must remain disabled and untouched. |
| `PASSWORD_RESET_EMAIL_OTP` | pandit | Intentionally disabled dead mapping (disableDeadPanditEmailMappings.js). Must remain disabled and untouched. |

## Not verified / not reachable

| Event | Recipient | Category | Reachable | Reason |
| --- | --- | --- | --- | --- |
| `ORDER_PLACED` | user | `SKIPPED-NOT-VERIFIED` | yes | Default skip. ORDER_PLACED fires at order creation before payment; the transactional post-payment email is ORDER_CONFIRMED (approved). |
| `KYC_SUBMITTED` | pandit | `SKIPPED-NOT-VERIFIED` | yes | Default skip. KYC submission is an internal hand-off to review; approval/rejection/reupload (approved) are the actionable pandit-facing emails. |
| `ACCOUNT_DELETION_REQUESTED` | user | `SKIPPED-NOT-VERIFIED` | yes | Default skip. Not in the approved account set for this phase. |
| `FEEDBACK_REQUEST` | user | `SKIPPED-NOT-REACHABLE` | no | No emitter. Standalone feedback-asking was removed (Phase 5.1); feedback is an optional action on SERVICE_COMPLETED, never its own message. |
| `PANDIT_ASSIGNED` | user | `SKIPPED-NOT-REACHABLE` | no | No emitter. The live assignment notification is PANDIT_ASSIGNMENT_PENDING to the pandit. |
| `PAYMENT_CREATED` | user | `SKIPPED-NOT-REACHABLE` | no | No emitter in the codebase. |
| `REFUND_INITIATED` | user | `SKIPPED-NOT-REACHABLE` | no | No emitter. Booking refunds are communicated via BOOKING_REFUNDED (approved). |
| `REFUND_COMPLETED` | user | `SKIPPED-NOT-REACHABLE` | no | No emitter. Booking refunds are communicated via BOOKING_REFUNDED (approved). |
| `PANDIT_ACCEPTED` | pandit | `SKIPPED-NOT-REACHABLE` | no | Not reachable for email: the emitter passes pandit {userId,name,phone} with no email, so the dispatcher cannot resolve a pandit email. |
| `PANDIT_REJECTED` | pandit | `SKIPPED-NOT-REACHABLE` | no | Not reachable for email: the emitter passes pandit {userId,name,phone} with no email. |
| `PAYOUT_RELEASED` | pandit | `SKIPPED-NOT-REACHABLE` | no | Not reachable for email: pandit is selected as name/userId/phone only (no email), so the dispatcher cannot resolve a pandit email. |
| `REFERRAL_BOOKING_CREATED` | pandit | `SKIPPED-NOT-VERIFIED` | yes | Pandit Referral flows are explicitly out of scope for this phase. |
| `REFERRAL_PENDING_REMARK` | pandit | `SKIPPED-NOT-VERIFIED` | yes | Pandit Referral flows are explicitly out of scope for this phase. |
| `REFERRAL_REMARK_SUBMITTED` | pandit | `SKIPPED-NOT-VERIFIED` | yes | Pandit Referral flows are explicitly out of scope for this phase. |
| `ADMIN_CREATED` | admin | `SKIPPED-NOT-REACHABLE` | no | Admin-facing notifications are out of scope for transactional customer email bootstrap. |
| `ADMIN_PASSWORD_RESET` | admin | `SKIPPED-NOT-REACHABLE` | no | Admin-facing notifications are out of scope for transactional customer email bootstrap. |
| `ADMIN_LOGIN` | admin | `SKIPPED-NOT-REACHABLE` | no | Admin-facing notifications are out of scope for transactional customer email bootstrap. |

## Contract notes
- Only `APPROVED_FOR_BOOTSTRAP` entries are written. Blocked/not-verified entries are reported, never created.
- Existing non-blank subject/HTML is never overwritten; an exact reference match is reported `ALREADY-CORRECT`, any other non-blank content is `PRESERVED-CUSTOM`.
- A blank/UNKNOWN purpose is filled from the registry; an explicit non-UNKNOWN purpose is preserved.
- A disabled mapping is never auto-enabled. WhatsApp/In-App content is never touched.
- All emails reuse the shared Phase 1 shell (branded header + shared footer/CTA markers resolved at render time by EmailRenderContext).
