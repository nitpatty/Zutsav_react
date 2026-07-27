# Notification Mappings Bootstrap Report

Generated: 2026-07-26T13:45:53.475Z
Bootstrap script version: 1.0.0
Database: zutsav_new_testing @ localhost

## Summary

| Outcome | Count |
|---|---|
| Created (mapping didn't exist) | 41 |
| Configured (existed, was blank) | 0 |
| Corrected (known-wrong legacy template) | 0 |
| Corrected (known-wrong legacy variable mapping) | 0 |
| Already correct (matches reference exactly) | 0 |
| Preserved (existing custom configuration, untouched) | 0 |
| **Total verified mappings processed** | **41** |

## Created
- `OTP_VERIFICATION` / user (`6a660f91b32f5936a4911dc8`) → `whatsapp_verification`
- `OTP_VERIFICATION` / pandit (`6a660f91b32f5936a4911dd0`) → `whatsapp_verification`
- `SERVICE_COMPLETION_OTP` / user (`6a660f91b32f5936a4911dd7`) → `whatsapp_verification`
- `DELIVERY_OTP_SENT` / user (`6a660f91b32f5936a4911ddc`) → `whatsapp_verification`
- `PASSWORD_RESET_WHATSAPP_OTP` / user (`6a660f91b32f5936a4911de0`) → `whatsapp_verification`
- `PASSWORD_RESET_WHATSAPP_OTP` / pandit (`6a660f91b32f5936a4911de3`) → `whatsapp_verification`
- `USER_REGISTERED` / user (`6a660f91b32f5936a4911de6`) → `new_user_registered`
- `PAYMENT_SUCCESS` / user (`6a660f91b32f5936a4911de9`) → `payment_success`
- `PARTIAL_PAYMENT_RECEIVED` / user (`6a660f91b32f5936a4911dec`) → `partial_payment_received`
- `FINAL_PAYMENT_RECEIVED` / user (`6a660f91b32f5936a4911def`) → `final_payment_received`
- `PAYMENT_FAILED` / user (`6a660f91b32f5936a4911df2`) → `payment_failed`
- `BOOKING_CONFIRMED` / user (`6a660f91b32f5936a4911df5`) → `booking_confirmed`
- `BOOKING_CANCELLED` / user (`6a660f91b32f5936a4911df8`) → `booking_cancelled`
- `BOOKING_REFUNDED` / user (`6a660f91b32f5936a4911dfb`) → `booking_refunded`
- `SERVICE_REMINDER_24H` / user (`6a660f91b32f5936a4911dfe`) → `service_reminder_24h`
- `SERVICE_REMINDER_1H` / user (`6a660f91b32f5936a4911e01`) → `service_reminder_1h`
- `SERVICE_COMPLETED` / user (`6a660f91b32f5936a4911e04`) → `service_completed`
- `INVOICE_GENERATED` / user (`6a660f91b32f5936a4911e07`) → `invoice_generated`
- `FEEDBACK_REQUEST` / user (`6a660f91b32f5936a4911e0a`) → `feedback_request`
- `KIT_SHIPPED` / user (`6a660f91b32f5936a4911e0d`) → `kit_shipped`
- `KIT_DELIVERED` / user (`6a660f91b32f5936a4911e10`) → `kit_delivered`
- `ORDER_CONFIRMED` / user (`6a660f91b32f5936a4911e13`) → `order_confirmed`
- `ORDER_PACKED` / user (`6a660f91b32f5936a4911e16`) → `order_packed`
- `ORDER_SHIPPED` / user (`6a660f91b32f5936a4911e19`) → `order_shipped`
- `ORDER_OUT_FOR_DELIVERY` / user (`6a660f91b32f5936a4911e1c`) → `order_out_for_delivery`
- `ORDER_DELIVERED` / user (`6a660f91b32f5936a4911e1f`) → `order_delivered`
- `ORDER_CANCELLED` / user (`6a660f91b32f5936a4911e22`) → `order_cancelled`
- `ORDER_REFUNDED` / user (`6a660f91b32f5936a4911e25`) → `order_refunded`
- `PANDIT_POOJA_REJECTED` / pandit (`6a660f91b32f5936a4911e28`) → `pandit_pooja_rejected`
- `PANDIT_REGISTERED` / pandit (`6a660f91b32f5936a4911e2b`) → `pandit_registered`
- `PANDIT_POOJA_APPROVED` / pandit (`6a660f91b32f5936a4911e2e`) → `pandit_pooja_approved`
- `PANDIT_APPROVED` / pandit (`6a660f91b32f5936a4911e31`) → `pandit_approved`
- `KYC_APPROVED` / pandit (`6a660f91b32f5936a4911e34`) → `kyc_approved`
- `KYC_REJECTED` / pandit (`6a660f91b32f5936a4911e37`) → `kyc_rejected`
- `KYC_REUPLOAD_REQUIRED` / pandit (`6a660f91b32f5936a4911e3a`) → `kyc_reupload_required`
- `ACCOUNT_RESTORED` / user (`6a660f91b32f5936a4911e3d`) → `account_restored`
- `ACCOUNT_DELETED` / user (`6a660f91b32f5936a4911e40`) → `account_deleted`
- `ACCOUNT_DELETION_CANCELLED` / user (`6a660f91b32f5936a4911e43`) → `account_deletion_cancelled`
- `ACCOUNT_DELETION_REQUESTED` / user (`6a660f91b32f5936a4911e46`) → `account_deletion_requested`
- `REFERRAL_BOOKING_CREATED` / referral_pandit (`6a660f91b32f5936a4911e49`) → `referral_booking_created`
- `PAYOUT_RELEASED` / pandit (`6a660f91b32f5936a4911e4c`) → `payout_released`

## Configured (filled in blank whatsappVariables)
_none_

## Corrected (legacy wrong template repointed)
_none_

## Corrected (legacy wrong variable mapping repointed)
_none_

## Preserved — existing administrator customization left untouched
_none_

## Mappings that still require manual configuration

These are not covered by verified reference data (or were already flagged as
unresolved even after bootstrap ran) — reusing the same startup validator
notification-engine/bootstrap.js uses, not a separate check:

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
