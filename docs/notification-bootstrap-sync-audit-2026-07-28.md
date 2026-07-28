# Notification Bootstrap ↔ Working Database Sync Audit

**Date:** 2026-07-28
**Source of truth:** live `MONGO_URI` database (`zutsav` @ `localhost:27017`) — queried directly, no dumps or prior audit databases used
**Compared against:** `backend/src/scripts/bootstrapNotificationMappings.js` (pre-fix)
**Method:** `VERIFIED_MAPPINGS` was extracted from the script in-process (no DB IIFE executed) and diffed field-by-field against every document in the live `notificationmappings` collection. Diff script and raw dump have been discarded (temp/scratch files, not committed).

## Totals

| | Count |
|---|---|
| Total mapping documents in working database | 52 |
| — `whatsapp` channel | 46 |
| — `email` channel | 4 |
| — `inapp` channel | 2 |
| Entries in `VERIFIED_MAPPINGS` (bootstrap, pre-fix) | 41 (whatsapp only — email/inapp were never in scope) |
| ✓ Perfect match (template + variables + button, both directions) | 41 / 41 |
| Missing from bootstrap | 10 |
| Different Variables / Template / Payload Paths / Button / Metadata / Channel / Recipient / Priority / Enabled | **0** — no drift found in any field for entries the script does cover |
| Unexpected / should NOT be added | 1 |

The 0-drift result matters: it means the 2026-07-22 and 2026-07-26 corrections already baked into the script are still holding — nothing has regressed. The gap is entirely one of **coverage**, not correctness.

## Per-mapping classification

### ✓ Perfect Match (41)

Every one of the 41 WhatsApp mappings already in `VERIFIED_MAPPINGS` matches the live database exactly — same template name, same positional variables (payload path + label), same button config. No changes needed. (Full list omitted here — it's the existing `VERIFIED_MAPPINGS` array, unchanged.)

### Missing from Bootstrap — WhatsApp (4)

These are real, correctly-configured, currently-enabled mappings in the working database. Their WhatsApp templates are confirmed `APPROVED` and synced in `whatsapptemplates`, and the template's `{{n}}` placeholder count matches the configured variable count exactly — i.e. these are verified-correct, not guesses:

| Event | Recipient | Template | Variables (position → payload path) | Button |
|---|---|---|---|---|
| `PANDIT_ACCEPTED` | user | `pandit_accepted` | 1→`customer.name`, 2→`pandit.name`, 3→`booking.number` | none |
| `PANDIT_ASSIGNED` | user | `pandit_assigned` | 1→`customer.name`, 2→`pandit.name`, 3→`booking.date`, 4→`booking.time`, 5→`booking.number` | none |
| `PANDIT_ASSIGNMENT_PENDING` | pandit | `pandit_assignment_pending` | 1→`pandit.name`, 2→`booking.poojaName`, 3→`booking.date`, 4→`booking.time` | none |
| `REFERRAL_PENDING_REMARK` | pandit | `referral_pending_remark` | 1→`pandit.name`, 2→`booking.number` | none |

This is the direct explanation for the reported symptom: on any database bootstrapped from the pre-fix script, these four mappings either don't exist at all, or exist as an admin-created blank stub — hence "Template expects N variables but this mapping has 0 configured."

### Missing from Bootstrap — Email (4)

The bootstrap script's scope was WhatsApp-only by design; these were never attempted, not a regression:

| Event | Recipient | Subject |
|---|---|---|
| `OTP_VERIFICATION` | user | "Your Zutsav OTP Code" |
| `OTP_VERIFICATION` | pandit | "Your Zutsav OTP Code" |
| `PASSWORD_RESET_EMAIL_OTP` | user | "Your Zutsav Password Reset Code" |
| `PASSWORD_RESET_EMAIL_OTP` | pandit | "Your Zutsav Password Reset Code" |

### Missing from Bootstrap — In-App (2)

| Event | Recipient | inAppType | Title |
|---|---|---|---|
| `KIT_SHIPPED` | user | `kit_shipped` | "Your Samagri Kit Has Been Shipped!" |
| `KIT_DELIVERED` | user | `kit_delivered` | "Samagri Kit Delivered!" |

### Unexpected Difference — excluded on purpose (1)

| Event | Recipient | Channel | Why excluded |
|---|---|---|---|
| `PASSWORD_RESET` | user | whatsapp | `enabled: false` in the working DB, and **not present in `EventRegistry.EVENTS`** at all — the registry's own comment marks it explicitly: *"old generic PASSWORD_RESET (never emitted, no flow existed behind it)"*, superseded by `PASSWORD_RESET_EMAIL_OTP` / `PASSWORD_RESET_WHATSAPP_OTP`. It is dead, disabled, orphaned data sitting in the working database, not verified production configuration. Adding it to bootstrap would violate the `NotificationMapping` schema's `eventName` enum (which no longer contains `PASSWORD_RESET`) and resurrect a dead code path. **Left out of bootstrap on purpose** — flagging here rather than silently dropping it, per the audit's "every mismatch must be classified" requirement. |

No other channel/recipient/priority/enabled/metadata differences were found anywhere in the audit.

## Disposition

- 4 WhatsApp + 4 Email + 2 In-App = **10 verified mappings added** to bootstrap.
- 1 mapping (`PASSWORD_RESET`/user/whatsapp) explicitly and permanently excluded — documented above, not silently ignored.
- 41 existing WhatsApp entries: unchanged, still 0 drift.
