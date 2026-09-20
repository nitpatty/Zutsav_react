# Phase 1 Email Templates — Bootstrap Report

Generated: 2026-09-19T15:26:46.680Z
Script version: 1.0.0
Database: zutsav @ localhost

## Mappings

- `BOOKING_CONFIRMED` (user/email) → `already-correct` (`6aae7b87a77e799e18bfe655`)
- `PAYMENT_SUCCESS` (user/email) → `already-correct` (`6aae7b87a77e799e18bfe65b`)

## Contract notes
- Only the two Phase 1 mappings (BOOKING_CONFIRMED, PAYMENT_SUCCESS; channel
  email, recipientType user) are ever written. WhatsApp/In-App content and the
  OTP/password-reset email family are never touched.
- Fill-if-blank and preserve-custom semantics match the verified
  bootstrapNotificationMappings bootstrap. A mapping an administrator already
  customized is reported as `preserved-custom` and left untouched.
