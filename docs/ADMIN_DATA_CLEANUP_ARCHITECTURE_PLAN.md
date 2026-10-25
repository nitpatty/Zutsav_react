# Admin Data Cleanup Architecture Plan

## Scope and verified current state

This is a design-only plan. No database operation was executed and no application code was changed for this plan.

The existing cleanup registry can safely operate only on independently-owned display/reference data: `Temple`, `Festival`, `EducationMaster`, `SpecializationMaster`, and `Blog` with its owned `BlogComment`, `BlogLike`, and `BlogBookmark` records. Its in-memory preview map is not a durable operation journal and must not be used for multi-domain production cleanup.

`SystemSettings`, `AdminAuditLog`, `AdminSession`, payment credentials, provider configuration, indexes, and schema definitions are permanently outside generic cleanup scope. `AdminAuditLog` is model-immutable and must remain so.

## Dependency matrix

| Category | Source model | Direct dependents / references | Safe policy now | Required execution policy |
|---|---|---|---|---|
| Bookings | `Booking` | `Invoice`, `PaymentLedger`, `PayoutBatch`, referrals/rewards, notifications, audit records | Not independently deletable in production | Block if retained financial/audit references exist; choose tombstone or approved finance-retention workflow first |
| Users / Pandits | `User`, `Pandit` | bookings, orders, wallets, OTP, sessions, referrals, notifications, KYC files, audit records | Not independently deletable while historical records remain | Delete only isolated ordinary accounts plus explicitly-owned non-financial data; otherwise archive/anonymize only after policy approval |
| Poojas | `Pooja` | `Booking.poojaId`, Pandit selections/prices, kits, festivals, translations | Potentially independent only where no retained references exist | Per-record eligibility: no retained booking or active dependent references; never delete a category implicitly |
| Pooja categories | `PoojaCategory` | `Pooja.categoryId`, `Pooja.categoryIds` | Safe only with no retained Pooja references | Block unless every referencing Pooja is selected and independently eligible |
| Products / variants | `Product` (variants embedded) | `Order.items.productId`, `Kit.items.productId`, inventory logs, translations | Potentially independent only where no retained order/kit reference exists | Per-record eligibility; embedded variants need no separate category |
| Kits | `Kit` | booking kit selections, `linkedPoojas`, products | Potentially independent only where no retained booking references exist | Block on retained booking references; products are not automatically deleted |
| Marketplace categories | `ProductCategory` | Product category usage (verify current representation: products use a string category) | Do not assume referential integrity from a model relation | Block/delete only after exact usage query is defined and zero retained products reference it |
| Orders | `Order` | `Shipment`, invoices, payment records, inventory logs, audit records | Not independently deletable in production | Block if any retained financial/shipping/inventory records exist; no stock/refund/notification side effects |
| Blog categories | `BlogCategory` | `Blog.category` | Safe only with no retained Blog references | Block unless referencing blogs are selected; blog selection deletes only blog-owned engagement records |
| Payments, invoices, offline payments, refunds, payouts | `PaymentLedger`, `Invoice`, `OfflinePayment`, payout/refund data | financial reconciliation and legal history | Protected | Never generic-cascade; requires separately approved retention workflow |
| Wallets, referrals, inventory logs, audit/security logs | wallet/referral/inventory/audit models | financial, anti-fraud, accountability history | Protected | Never generic-cascade; retention-specific processes only |

Historical booking and order documents include denormalized customer/address and line-item data, but still retain ObjectId references. A missing referenced catalog/user document can break controller population or administrative detail views; snapshots alone do not establish that hard deletion is safe.

## Category deletion strategy

1. **Temples, festivals, education/specialization masters, blog posts:** retain the existing explicit model-owned plans. For masters, add a reference scan of active Pandit data before enabling deletion.
2. **Catalog records:** use Strategy A only for individual records proven unreferenced at execution time. Use Strategy B for category + child selections; the server must require both selected and independently eligible, never add children automatically.
3. **Blog categories:** Strategy B. Block when retained posts reference the category; allow only when all those posts are explicitly selected, or no posts reference it.
4. **Users:** Strategy C by default. Hard delete only isolated ordinary `user`/`pandit` accounts after a dependency scan; preserve retained historical attribution through a tombstone/anonymization design only after read paths are updated.
5. **Bookings and orders:** Strategy C in production. Do not hard-delete while financial, invoice, shipment, inventory, referral, payout, or audit dependencies are retained. A development/staging-only full purge (Strategy D) may be considered separately with an environment allowlist and disposable database guard.
6. **Financial/security records:** protected. No generic cleanup strategy applies without legal/accounting approval.

## System Administrator protection

All User cleanup queries must be backend-owned and include:

```js
{ role: { $nin: ['admin', 'system_admin'] }, _id: { $ne: req.user._id } }
```

At execution, re-query protected accounts and assert that every `system_admin`, the initiating operator, and at least one active privileged administrator remains. Do not consume protected IDs, roles, or filters from the client. Existing individual delete/suspend endpoints must apply the same server-side guard before mutating a user.

## Durable operation journal

Replace process-memory previews with a `DataCleanupOperation` collection. Required fields:

- immutable operation UUID, initiator, confirmed category IDs, and normalized server-owned plan hash;
- preview expiry, state (`previewed`, `queued`, `running`, `completed`, `failed`, `partial`, `cancelled`), idempotency key;
- dependency warnings, protected-count snapshot, per-model planned/deleted/remaining counts;
- current phase, lease owner/expiry, retry count, timestamps, and sanitized failure details;
- final audit-log identifier and verification result.

Add a unique index on the idempotency key and a lease-aware conditional update for claiming work. Preview stores only server-derived filters and a plan hash. Execute accepts only `{operationId, confirmationPhrase}`; it reloads the operation, rechecks authorization/protected accounts/dependencies, and rejects drift with a fresh-preview requirement.

Use a MongoDB transaction only when the deployment is a replica set and the operation is small enough to fit transaction limits. Large operations use ordered, resumable phases with bounded batches and a durable checkpoint after every batch. Multi-collection deletes are not otherwise atomic.

### Recovery algorithm

1. Worker claims `previewed/queued` operation with a compare-and-set lease.
2. Revalidate policy and record the exact execution snapshot.
3. For each phase, delete a bounded server-owned ID batch, verify remaining count, and atomically checkpoint progress.
4. On process crash, a worker may reclaim an expired lease and resume only the recorded phase/remaining IDs.
5. On a non-retryable failure, mark `partial` with completed phases; never report success.
6. On completion, query authoritative remaining counts, persist them, then create the immutable audit event.

Cancellation is allowed only before `running`; in-progress deletion may be stopped only at a batch boundary and is then `partial`, never rolled back by inventing data.

## Preview and confirmation contract

`POST /preview` receives only stable category IDs. The server validates duplicates/unknown IDs, computes dependencies and eligibility, creates the durable operation, and returns operation ID, expiry, exact counts, protected counts, warnings, blocked dependencies, and `executable`.

`POST /execute` receives only operation ID and the exact confirmation phrase. It validates operation owner, expiry, state, plan hash, current authorization, system-admin invariants, dependency drift, and idempotency. `GET /operations/:id` provides sanitized progress/result data to the owner/admin.

No route accepts model names, Mongo filters, collection names, or client-calculated counts.

## Decisions requiring business approval

| Decision | Recommended default | Consequence |
|---|---|---|
| Financial retention | Retain indefinitely; exclude from generic cleanup | Bookings/orders with financial links remain blocked from hard purge |
| Historical attribution | Tombstone/anonymize only after read-path work | Ordinary users cannot be hard-deleted while referenced history is retained |
| Production hard purge | Disabled; staging/development only until approved | Avoids irreversible reconciliation/legal loss |
| Backup requirement | Verified restorable backup plus maintenance approval | Adds operational gate before destructive production work |
| Catalog retention | Delete only unreferenced records | Some catalog cleanup requires dependency resolution first |
| User account policy | Protect all privileged accounts and active operator | Prevents lockout; ordinary account policy needs privacy/legal sign-off |

## Delivery phases and acceptance gates

1. **Policy approval:** approve retention/tombstone rules and production authorization.
2. **Journal:** add operation schema, indexes, state machine, lease/recovery tests.
3. **Preview:** add dependency scans and plan-hash/count-drift validation.
4. **Users:** add privileged-account guards to bulk and individual actions; support only isolated-account deletion until tombstones exist.
5. **Catalog:** enable per-record unreferenced Poojas/products/kits and dependency-blocked categories.
6. **Bookings/orders:** implement only after financial/history policy approval; otherwise remain blocked.
7. **UI:** server-driven warnings, progress, partial/recovery states, and protected-account explanation.
8. **Validation:** disposable-database destructive tests, concurrency/crash tests, backup/restore drill, then staged deployment.

Acceptance requires: selected-only scope, protected System Administrator preservation, no financial/audit cascade, durable idempotent recovery, verified counts, and no success result after partial work.

## Deployment prerequisites and risks

Confirm replica-set transaction capability, establish a backup/restore runbook, restrict production execution to a maintenance window, rate-limit high-risk endpoints, and alert on partial/failed operations. The primary remaining risk is treating a reference as a harmless snapshot when an administrative or reporting read path still dereferences it; every category must be proven by integration tests before enablement.
