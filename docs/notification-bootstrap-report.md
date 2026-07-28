# Notification Mappings Bootstrap Report

Generated: 2026-07-28T06:18:27.328Z
Bootstrap script version: 1.1.0
Database: zutsav_test @ localhost

## Summary — WhatsApp

| Outcome | Count |
|---|---|
| Created (mapping didn't exist) | 45 |
| Configured (existed, was blank) | 0 |
| Corrected (known-wrong legacy template) | 0 |
| Corrected (known-wrong legacy variable mapping) | 0 |
| Already correct (matches reference exactly) | 0 |
| Preserved (existing custom configuration, untouched) | 0 |
| **Total WhatsApp mappings processed** | **45** |

## Summary — Email

| Outcome | Count |
|---|---|
| Created | 4 |
| Configured (existed, was blank) | 0 |
| Already correct | 0 |
| Preserved (existing custom content, untouched) | 0 |
| **Total Email mappings processed** | **4** |

## Summary — In-App

| Outcome | Count |
|---|---|
| Created | 2 |
| Configured (existed, was blank) | 0 |
| Already correct | 0 |
| Preserved (existing custom content, untouched) | 0 |
| **Total In-App mappings processed** | **2** |

**Grand total verified mappings processed (all channels): 51**

## Created — WhatsApp
- `OTP_VERIFICATION` / user (`6a6849b30c5e2783c0204982`) → `whatsapp_verification`
- `OTP_VERIFICATION` / pandit (`6a6849b30c5e2783c0204990`) → `whatsapp_verification`
- `SERVICE_COMPLETION_OTP` / user (`6a6849b30c5e2783c0204995`) → `whatsapp_verification`
- `DELIVERY_OTP_SENT` / user (`6a6849b30c5e2783c0204998`) → `whatsapp_verification`
- `PASSWORD_RESET_WHATSAPP_OTP` / user (`6a6849b30c5e2783c020499b`) → `whatsapp_verification`
- `PASSWORD_RESET_WHATSAPP_OTP` / pandit (`6a6849b30c5e2783c020499e`) → `whatsapp_verification`
- `USER_REGISTERED` / user (`6a6849b30c5e2783c02049a1`) → `new_user_registered`
- `PAYMENT_SUCCESS` / user (`6a6849b30c5e2783c02049a5`) → `payment_success`
- `PARTIAL_PAYMENT_RECEIVED` / user (`6a6849b30c5e2783c02049a8`) → `partial_payment_received`
- `FINAL_PAYMENT_RECEIVED` / user (`6a6849b30c5e2783c02049ab`) → `final_payment_received`
- `PAYMENT_FAILED` / user (`6a6849b30c5e2783c02049ae`) → `payment_failed`
- `BOOKING_CONFIRMED` / user (`6a6849b30c5e2783c02049b1`) → `booking_confirmed`
- `BOOKING_CANCELLED` / user (`6a6849b30c5e2783c02049b4`) → `booking_cancelled`
- `BOOKING_REFUNDED` / user (`6a6849b30c5e2783c02049b7`) → `booking_refunded`
- `SERVICE_REMINDER_24H` / user (`6a6849b30c5e2783c02049ba`) → `service_reminder_24h`
- `SERVICE_REMINDER_1H` / user (`6a6849b30c5e2783c02049bd`) → `service_reminder_1h`
- `SERVICE_COMPLETED` / user (`6a6849b30c5e2783c02049c0`) → `service_completed`
- `INVOICE_GENERATED` / user (`6a6849b30c5e2783c02049c3`) → `invoice_generated`
- `FEEDBACK_REQUEST` / user (`6a6849b30c5e2783c02049c6`) → `feedback_request`
- `KIT_SHIPPED` / user (`6a6849b30c5e2783c02049c9`) → `kit_shipped`
- `KIT_DELIVERED` / user (`6a6849b30c5e2783c02049cc`) → `kit_delivered`
- `ORDER_CONFIRMED` / user (`6a6849b30c5e2783c02049cf`) → `order_confirmed`
- `ORDER_PACKED` / user (`6a6849b30c5e2783c02049d2`) → `order_packed`
- `ORDER_SHIPPED` / user (`6a6849b30c5e2783c02049d5`) → `order_shipped`
- `ORDER_OUT_FOR_DELIVERY` / user (`6a6849b30c5e2783c02049d8`) → `order_out_for_delivery`
- `ORDER_DELIVERED` / user (`6a6849b30c5e2783c02049db`) → `order_delivered`
- `ORDER_CANCELLED` / user (`6a6849b30c5e2783c02049de`) → `order_cancelled`
- `ORDER_REFUNDED` / user (`6a6849b30c5e2783c02049e1`) → `order_refunded`
- `PANDIT_POOJA_REJECTED` / pandit (`6a6849b30c5e2783c02049e4`) → `pandit_pooja_rejected`
- `PANDIT_REGISTERED` / pandit (`6a6849b30c5e2783c02049e7`) → `pandit_registered`
- `PANDIT_ACCEPTED` / user (`6a6849b30c5e2783c02049ea`) → `pandit_accepted`
- `PANDIT_ASSIGNED` / user (`6a6849b30c5e2783c02049ed`) → `pandit_assigned`
- `PANDIT_ASSIGNMENT_PENDING` / pandit (`6a6849b30c5e2783c02049f0`) → `pandit_assignment_pending`
- `REFERRAL_PENDING_REMARK` / pandit (`6a6849b30c5e2783c02049f3`) → `referral_pending_remark`
- `PANDIT_POOJA_APPROVED` / pandit (`6a6849b30c5e2783c02049f6`) → `pandit_pooja_approved`
- `PANDIT_APPROVED` / pandit (`6a6849b30c5e2783c02049f9`) → `pandit_approved`
- `KYC_APPROVED` / pandit (`6a6849b30c5e2783c02049fc`) → `kyc_approved`
- `KYC_REJECTED` / pandit (`6a6849b30c5e2783c02049ff`) → `kyc_rejected`
- `KYC_REUPLOAD_REQUIRED` / pandit (`6a6849b30c5e2783c0204a02`) → `kyc_reupload_required`
- `ACCOUNT_RESTORED` / user (`6a6849b30c5e2783c0204a05`) → `account_restored`
- `ACCOUNT_DELETED` / user (`6a6849b30c5e2783c0204a08`) → `account_deleted`
- `ACCOUNT_DELETION_CANCELLED` / user (`6a6849b30c5e2783c0204a0b`) → `account_deletion_cancelled`
- `ACCOUNT_DELETION_REQUESTED` / user (`6a6849b30c5e2783c0204a0e`) → `account_deletion_requested`
- `REFERRAL_BOOKING_CREATED` / referral_pandit (`6a6849b30c5e2783c0204a11`) → `referral_booking_created`
- `PAYOUT_RELEASED` / pandit (`6a6849b30c5e2783c0204a14`) → `payout_released`

## Configured (filled in blank whatsappVariables) — WhatsApp
_none_

## Corrected (legacy wrong template repointed)
_none_

## Corrected (legacy wrong variable mapping repointed)
_none_

## Preserved — existing administrator customization left untouched (WhatsApp)
_none_

## Created — Email
- `OTP_VERIFICATION` / user (`6a6849b30c5e2783c0204a17`) → "Your Zutsav OTP Code"
- `OTP_VERIFICATION` / pandit (`6a6849b30c5e2783c0204a1a`) → "Your Zutsav OTP Code"
- `PASSWORD_RESET_EMAIL_OTP` / user (`6a6849b30c5e2783c0204a1d`) → "Your Zutsav Password Reset Code"
- `PASSWORD_RESET_EMAIL_OTP` / pandit (`6a6849b30c5e2783c0204a20`) → "Your Zutsav Password Reset Code"

## Configured (filled in blank subject/HTML) — Email
_none_

## Preserved — existing administrator content left untouched (Email)
_none_

## Created — In-App
- `KIT_SHIPPED` / user (`6a6849b30c5e2783c0204a23`) → `kit_shipped`
- `KIT_DELIVERED` / user (`6a6849b30c5e2783c0204a26`) → `kit_delivered`

## Configured (filled in blank title/message) — In-App
_none_

## Preserved — existing administrator content left untouched (In-App)
_none_

## Mappings that still require manual configuration

These are not covered by verified reference data (or were already flagged as
unresolved even after bootstrap ran) — reusing the same startup validator
notification-engine/bootstrap.js uses, not a separate check. Note this check
is WhatsApp-specific (Email/In-App have no Meta template to validate against):

- [OTP_VERIFICATION / user] template "whatsapp_verification" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [OTP_VERIFICATION / pandit] template "whatsapp_verification" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [SERVICE_COMPLETION_OTP / user] template "whatsapp_verification" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [DELIVERY_OTP_SENT / user] template "whatsapp_verification" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PASSWORD_RESET_WHATSAPP_OTP / user] template "whatsapp_verification" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PASSWORD_RESET_WHATSAPP_OTP / pandit] template "whatsapp_verification" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [USER_REGISTERED / user] template "new_user_registered" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PAYMENT_SUCCESS / user] template "payment_success" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PARTIAL_PAYMENT_RECEIVED / user] template "partial_payment_received" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [FINAL_PAYMENT_RECEIVED / user] template "final_payment_received" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PAYMENT_FAILED / user] template "payment_failed" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [BOOKING_CONFIRMED / user] template "booking_confirmed" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [BOOKING_CANCELLED / user] template "booking_cancelled" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [BOOKING_REFUNDED / user] template "booking_refunded" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [SERVICE_REMINDER_24H / user] template "service_reminder_24h" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [SERVICE_REMINDER_1H / user] template "service_reminder_1h" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [SERVICE_COMPLETED / user] template "service_completed" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [INVOICE_GENERATED / user] template "invoice_generated" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [FEEDBACK_REQUEST / user] template "feedback_request" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [KIT_SHIPPED / user] template "kit_shipped" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [KIT_DELIVERED / user] template "kit_delivered" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [ORDER_CONFIRMED / user] template "order_confirmed" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [ORDER_PACKED / user] template "order_packed" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [ORDER_SHIPPED / user] template "order_shipped" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [ORDER_OUT_FOR_DELIVERY / user] template "order_out_for_delivery" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [ORDER_DELIVERED / user] template "order_delivered" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [ORDER_CANCELLED / user] template "order_cancelled" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [ORDER_REFUNDED / user] template "order_refunded" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PANDIT_POOJA_REJECTED / pandit] template "pandit_pooja_rejected" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PANDIT_REGISTERED / pandit] template "pandit_registered" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PANDIT_ACCEPTED / user] template "pandit_accepted" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PANDIT_ASSIGNED / user] template "pandit_assigned" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PANDIT_ASSIGNMENT_PENDING / pandit] template "pandit_assignment_pending" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [REFERRAL_PENDING_REMARK / pandit] template "referral_pending_remark" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PANDIT_POOJA_APPROVED / pandit] template "pandit_pooja_approved" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PANDIT_APPROVED / pandit] template "pandit_approved" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [KYC_APPROVED / pandit] template "kyc_approved" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [KYC_REJECTED / pandit] template "kyc_rejected" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [KYC_REUPLOAD_REQUIRED / pandit] template "kyc_reupload_required" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [ACCOUNT_RESTORED / user] template "account_restored" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [ACCOUNT_DELETED / user] template "account_deleted" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [ACCOUNT_DELETION_CANCELLED / user] template "account_deletion_cancelled" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [ACCOUNT_DELETION_REQUESTED / user] template "account_deletion_requested" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [REFERRAL_BOOKING_CREATED / referral_pandit] template "referral_booking_created" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?
- [PAYOUT_RELEASED / pandit] template "payout_released" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?

---
This report is regenerated every time `bootstrapNotificationMappings.js` runs and reflects only the most recent run.
