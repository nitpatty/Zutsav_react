# Notification Mappings Bootstrap Report

Generated: 2026-07-26T11:06:41.050Z
Bootstrap script version: 1.0.0
Database: zutsav @ localhost

## Summary

| Outcome | Count |
|---|---|
| Created (mapping didn't exist) | 0 |
| Configured (existed, was blank) | 0 |
| Corrected (known-wrong legacy template) | 0 |
| Corrected (known-wrong legacy variable mapping) | 1 |
| Already correct (matches reference exactly) | 40 |
| Preserved (existing custom configuration, untouched) | 0 |
| **Total verified mappings processed** | **41** |

## Created
_none_

## Configured (filled in blank whatsappVariables)
_none_

## Corrected (legacy wrong template repointed)
_none_

## Corrected (legacy wrong variable mapping repointed)
- `PARTIAL_PAYMENT_RECEIVED` / user (`6a537266746634fc1fb057fc`) → `partial_payment_received`

## Preserved — existing administrator customization left untouched
_none_

## Mappings that still require manual configuration

These are not covered by verified reference data (or were already flagged as
unresolved even after bootstrap ran) — reusing the same startup validator
notification-engine/bootstrap.js uses, not a separate check:

_none — every enabled WhatsApp mapping in this database resolves correctly._

---
This report is regenerated every time `bootstrapNotificationMappings.js` runs and reflects only the most recent run.
