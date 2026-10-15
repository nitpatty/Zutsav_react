# Notification Mappings Bootstrap Report

Generated: 2026-09-27T15:28:31.287Z
Bootstrap script version: 1.3.0
Database: zutsav @ localhost

## Summary — WhatsApp

| Outcome | Count |
|---|---|
| Created (mapping didn't exist) | 1 |
| Configured (existed, was blank) | 0 |
| Corrected (known-wrong legacy template) | 0 |
| Corrected (known-wrong legacy variable mapping) | 0 |
| Already correct (matches reference exactly) | 46 |
| Preserved (existing custom configuration, untouched) | 0 |
| **Total WhatsApp mappings processed** | **47** |

## Summary — Email

| Outcome | Count |
|---|---|
| Created | 1 |
| Configured (existed, was blank) | 0 |
| Already correct | 4 |
| Preserved (existing custom content, untouched) | 0 |
| **Total Email mappings processed** | **5** |

## Summary — In-App

| Outcome | Count |
|---|---|
| Created | 1 |
| Configured (existed, was blank) | 0 |
| Already correct | 2 |
| Preserved (existing custom content, untouched) | 0 |
| **Total In-App mappings processed** | **3** |

**Grand total verified mappings processed (all channels): 55**

## Purpose classification (Phase 5 — WhatsApp consent)

Every verified mapping carries a communication purpose (ACCOUNT / BOOKING /
ORDER / SERVICE / MARKETING). MARKETING-purpose WhatsApp messages require
explicit marketing consent before sending; no verified mapping is MARKETING
today. Purpose follows a fill-if-blank contract independent of channel
content — an administrator-set purpose is never overwritten.

| Outcome | Count |
|---|---|
| Created with purpose | 3 |
| Purpose set (was blank) | 0 |
| Purpose matches verified | 52 |
| Purpose preserved (admin customization, untouched) | 0 |

## Created — WhatsApp
- `PANDIT_CANCELLED` / admin (`6ab9361f1b32aa55f0a8edb6`) → `pandit_cancelled_admin` — purpose: BOOKING

## Configured (filled in blank whatsappVariables) — WhatsApp
_none_

## Corrected (legacy wrong template repointed)
_none_

## Corrected (legacy wrong variable mapping repointed)
_none_

## Preserved — existing administrator customization left untouched (WhatsApp)
_none_

## Created — Email
- `PANDIT_CANCELLED` / admin (`6ab9361f1b32aa55f0a8edc6`) → "Action required: Pandit cancelled an accepted booking (#{{booking.number}})" — purpose: BOOKING

## Configured (filled in blank subject/HTML) — Email
_none_

## Preserved — existing administrator content left untouched (Email)
_none_

## Created — In-App
- `PANDIT_CANCELLED` / admin (`6ab9361f1b32aa55f0a8edcf`) → `pandit_cancelled` — purpose: BOOKING

## Configured (filled in blank title/message) — In-App
_none_

## Preserved — existing administrator content left untouched (In-App)
_none_

## Mappings that still require manual configuration

These are not covered by verified reference data (or were already flagged as
unresolved even after bootstrap ran) — reusing the same startup validator
notification-engine/bootstrap.js uses, not a separate check. Note this check
is WhatsApp-specific (Email/In-App have no Meta template to validate against):

- [PANDIT_CANCELLED / admin] template "pandit_cancelled_admin" not found in the synced WhatsAppTemplate collection — has the Meta template sync run in this environment?

---
This report is regenerated every time `bootstrapNotificationMappings.js` runs and reflects only the most recent run.
