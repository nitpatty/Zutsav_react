# Notification Mapping Fix Report

**Incident:** WhatsApp Notification Mapping Dry Run reporting "0/1 configured" / "No variable configured for this position"
**Status:** Resolved (data fix) — verified, not yet applied to the client's live production database
**Prepared for:** Client audit record

---

## Root Cause Summary

The Notification Engine code was audited end-to-end and found correct. The issue was isolated to duplicate `NotificationMapping` documents in the database, not to any code defect.

A batch operation created duplicate mapping documents for 4 event/recipient combinations — three inserts within 49 seconds of each other on **2026-07-21 (14:33:40–14:34:29 IST)**, plus one earlier on **2026-07-08 (13:07:14 IST)**. Each duplicate had `whatsappTemplateName` correctly set but `whatsappVariables: []`, while an already-correctly-configured sibling mapping already existed for the same event/recipient/channel.

The Admin Mapping List (`GET /api/admin/notifications/mappings`) sorts results by:

```
{ eventName: 1, priority: -1, createdAt: -1 }
```

Every affected mapping shared the same `priority` (0), so the sort fell through to `createdAt` descending — meaning the **newer, broken duplicate always appeared first** in the list for these events. Any admin opening the top row and running a Dry Run was, without realizing it, testing the broken duplicate while a correctly-configured sibling sat unused directly below it.

This was proven, not assumed: the actual production code path (`getNotificationMappings` → `testNotificationMapping` → `WhatsAppChannel.buildVariableChecklist` → `WhatsAppTemplate.findOne` → `VariableResolver`) was executed against a restored, isolated copy of the client's database. The broken duplicate reproduced "0/1 configured" exactly as reported; the healthy sibling, run through the identical code path, resolved successfully. One event (`PASSWORD_RESET_WHATSAPP_OTP`/pandit) had no correctly-configured document at all — both existing copies were unconfigured.

**No code, schema, template, or unrelated collection was found to be at fault.**

---

## Affected Mapping IDs

| Mapping `_id` | Event | Recipient | Role before fix |
|---|---|---|---|
| `6a4dfe2a8e3cd7a304da1f9f` | `OTP_VERIFICATION` | user | Broken duplicate (created 2026-07-08) |
| `6a5f35ec69407f53f7c998ef` | `PASSWORD_RESET_WHATSAPP_OTP` | user | Broken duplicate (created 2026-07-21 14:33:40) |
| `6a5f361d69407f53f7c9992e` | `BOOKING_CONFIRMED` | user | Broken duplicate (created 2026-07-21 14:34:29) |
| `6a5487d46f20deb3ef881f13` | `PASSWORD_RESET_WHATSAPP_OTP` | pandit | Unconfigured (created 2026-07-13) — no healthy sibling existed |
| `6a5f35fa69407f53f7c9990a` | `PASSWORD_RESET_WHATSAPP_OTP` | pandit | Broken duplicate of the above (created 2026-07-21 14:33:54) |

Healthy sibling mappings (untouched, already correct) that were confirmed to co-exist alongside the duplicates: `6a40b3475c89dc5c587ba953` (`OTP_VERIFICATION`/user), `6a5477fa845402ee16ff3c3c` (`PASSWORD_RESET_WHATSAPP_OTP`/user), `6a5370b8746634fc1fb0568e` (`BOOKING_CONFIRMED`/user).

---

## Updated Fields

For each affected mapping, only the following fields were modified via `$set`:

- `whatsappVariables` — set to the verified-correct positional payload mapping
- `whatsappButtonType` / `whatsappButtonPayloadPath` — set where applicable (OTP-style "Copy Code" button)
- `enabled` — set to `false` on redundant duplicates only

No other field was touched. `_id` and `createdAt` were never modified on any document. No document was deleted.

| Mapping `_id` | `whatsappVariables` set to | `enabled` set to |
|---|---|---|
| `6a4dfe2a8e3cd7a304da1f9f` | `[{position:1, payloadPath:"otp.code", label:"OTP code"}]` | `false` |
| `6a5f35ec69407f53f7c998ef` | `[{position:1, payloadPath:"otp.code", label:"OTP code"}]` | `false` |
| `6a5f361d69407f53f7c9992e` | `[{position:1,"customer.name"}, {2,"booking.poojaName"}, {3,"booking.date"}, {4,"booking.time"}, {5,"booking.number"}]` | `false` |
| `6a5487d46f20deb3ef881f13` | `[{position:1, payloadPath:"otp.code", label:"OTP code"}]` | `true` (kept — canonical) |
| `6a5f35fa69407f53f7c9990a` | `[{position:1, payloadPath:"otp.code", label:"OTP code"}]` | `false` |

---

## Disabled Duplicate IDs

The following redundant duplicate mappings were disabled (`enabled: false`) — **not deleted**. Each remains in the database with full history intact and can be re-enabled if ever needed:

- `6a4dfe2a8e3cd7a304da1f9f`
- `6a5f35ec69407f53f7c998ef`
- `6a5f361d69407f53f7c9992e`
- `6a5f35fa69407f53f7c9990a`

One document, `6a5487d46f20deb3ef881f13`, was repaired and **kept enabled** as the sole canonical mapping for `PASSWORD_RESET_WHATSAPP_OTP`/pandit, since no healthy alternative existed for that event/recipient.

---

## Verification Results

### Repair script idempotency

| Run | Updated | Disabled | Already Correct | Skipped |
|---|---|---|---|---|
| Run #1 (initial, against pre-fix data) | 5 | 4 | 0 | 0 |
| Run #2 (immediately re-run) | 0 | 0 | 5 | 0 |

Confirms the script is safe to run multiple times with no unintended side effects.

### Runtime trace (post-fix)

The identical production code path used to prove the root cause was re-executed after the fix. Every mapping row for every affected event — whichever one the Admin UI would present first — now resolves successfully:

| Event / Recipient | Top-row mapping tested | Result |
|---|---|---|
| `OTP_VERIFICATION` / user | `6a4dfe2a...` | `allResolved: true`, `ok: true` |
| `OTP_VERIFICATION` / pandit | `6a40b34e...` | `allResolved: true`, `ok: true` |
| `PASSWORD_RESET_WHATSAPP_OTP` / user | `6a5f35ec...` | `allResolved: true`, `ok: true` |
| `PASSWORD_RESET_WHATSAPP_OTP` / pandit | `6a5f35fa...` | `allResolved: true`, `ok: true` |
| `BOOKING_CONFIRMED` / user | `6a5f361d...` | `allResolved: true`, `ok: true` |

### Scope confirmation

Verified before and after the fix that document counts in every excluded collection were unchanged:

| Collection | Before | After |
|---|---|---|
| `whatsapptemplates` | 92 | 92 |
| `triggerrules` | 30 | 30 |
| `emailtemplates` | 0 | 0 |
| `notificationlogs` | 28 | 28 |
| `notificationjobs` | 3 | 3 |
| `notificationmappingversions` | 5 | 5 |
| `systemsettings` | 1 | 1 |
| `notificationmappings` (total count) | 56 | 56 |

`notificationmappings` staying at 56 confirms the fix performed in-place field edits only — no documents were inserted or deleted.

### Environment tested

All execution and verification above was performed against an isolated restore of the client-provided database dump (`zutsav-full.archive`, `mongorestore --nsFrom="zutsav.*" --nsTo="zutsav_client_audit.*"`), never against the live production database and never against the local development database. The script is ready to run against production directly by the client/deployment owner.

---

## Timestamp

Report generated: **2026-07-22 12:22 IST** (2026-07-22T06:52:05Z)
Fix verified against isolated audit database: **2026-07-22**

## Script Version

`fixDuplicateWhatsappMappings.js` — **v1.0.0**
Location: `backend/src/scripts/fixDuplicateWhatsappMappings.js`
