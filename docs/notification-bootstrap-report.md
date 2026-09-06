# Notification Mappings Bootstrap Report

Generated: 2026-09-05T13:39:17.252Z
Bootstrap script version: 1.3.0
Database: zutsav @ localhost

## Summary — WhatsApp

| Outcome | Count |
|---|---|
| Created (mapping didn't exist) | 0 |
| Configured (existed, was blank) | 0 |
| Corrected (known-wrong legacy template) | 0 |
| Corrected (known-wrong legacy variable mapping) | 0 |
| Already correct (matches reference exactly) | 46 |
| Preserved (existing custom configuration, untouched) | 0 |
| **Total WhatsApp mappings processed** | **46** |

## Summary — Email

| Outcome | Count |
|---|---|
| Created | 0 |
| Configured (existed, was blank) | 0 |
| Already correct | 4 |
| Preserved (existing custom content, untouched) | 0 |
| **Total Email mappings processed** | **4** |

## Summary — In-App

| Outcome | Count |
|---|---|
| Created | 0 |
| Configured (existed, was blank) | 0 |
| Already correct | 2 |
| Preserved (existing custom content, untouched) | 0 |
| **Total In-App mappings processed** | **2** |

**Grand total verified mappings processed (all channels): 52**

## Purpose classification (Phase 5 — WhatsApp consent)

Every verified mapping carries a communication purpose (ACCOUNT / BOOKING /
ORDER / SERVICE / MARKETING). MARKETING-purpose WhatsApp messages require
explicit marketing consent before sending; no verified mapping is MARKETING
today. Purpose follows a fill-if-blank contract independent of channel
content — an administrator-set purpose is never overwritten.

| Outcome | Count |
|---|---|
| Created with purpose | 0 |
| Purpose set (was blank) | 0 |
| Purpose matches verified | 52 |
| Purpose preserved (admin customization, untouched) | 0 |

## Created — WhatsApp
_none_

## Configured (filled in blank whatsappVariables) — WhatsApp
_none_

## Corrected (legacy wrong template repointed)
_none_

## Corrected (legacy wrong variable mapping repointed)
_none_

## Preserved — existing administrator customization left untouched (WhatsApp)
_none_

## Created — Email
_none_

## Configured (filled in blank subject/HTML) — Email
_none_

## Preserved — existing administrator content left untouched (Email)
_none_

## Created — In-App
_none_

## Configured (filled in blank title/message) — In-App
_none_

## Preserved — existing administrator content left untouched (In-App)
_none_

## Mappings that still require manual configuration

These are not covered by verified reference data (or were already flagged as
unresolved even after bootstrap ran) — reusing the same startup validator
notification-engine/bootstrap.js uses, not a separate check. Note this check
is WhatsApp-specific (Email/In-App have no Meta template to validate against):

_none — every enabled WhatsApp mapping in this database resolves correctly._

---
This report is regenerated every time `bootstrapNotificationMappings.js` runs and reflects only the most recent run.
