# Stage A: fulfillment and shipment preparation

## Manual prerequisite

Review and manually apply `migrations/20261101_stage_a_preparation.sql` once in Neon.
It adds five new functions (`stage_a_lock_item`, create/update fulfillment,
create/update shipment) and two partial unique indexes. It does not replace
existing functions or update records. The existing cancellation/refund migration,
including `payment_refund`, is a prerequisite.

The migration is transactional. If active duplicates already exist, index creation
fails and rolls back: review the records rather than deleting them automatically.
This patch did not execute the migration or any database write.

## Availability

- GET lists, detail views, eligibility selectors, search and pagination work with
  existing tables before applying the migration.
- POST/PATCH require the migration. Lists expose `ready`; the UI disables mutation
  controls when false. Direct mutation requests fail closed with HTTP 503 when
  the new functions are missing. There is no application-side fallback insert.
- Each write calls one new SQL function in one Neon HTTP request. All checks and
  changes are in that database transaction; no interactive HTTP transaction is assumed.

## Eligibility and concurrency

Only CONFIRMED orders with exactly one successful payment equal to the positive
order total, no refunded payment/refund ledger entries, and confirmed reservation
quantity equal to the selected order-item quantity can proceed. Reservation
product IDs and inventory hold ledger totals must agree. Confirmed holds are not
rejected merely because their original ACTIVE expiry timestamp passed.

Selectors are advisory snapshots, refreshed after mutations; functions recheck
eligibility while holding the existing parent-order lock. Lock order is order,
payments, inventory IDs ascending, reservation IDs ascending, fulfillment, shipment.
Existing payment/cancellation/expiry functions are not modified. New duplicate
indexes guard active records even against concurrent inserts outside these APIs.
Other future writers must still honor the same lock and eligibility protocol.

Creation of any active fulfillment blocks normal order cancellation/refunds under
the existing cancellation function. The UI requests confirmation before creating
one. Stage A deliberately provides no cancellation, delete, or dispatch action.

Fulfillment transitions: PENDING → PROCESSING → PACKED only. `fulfillment_date`
is explicitly NULL on creation; it is not a creation timestamp. Shipment creation
requires PACKED fulfillment. Shipments remain PENDING, with explicit NULL
`ship_date` and `delivery_date`. Only courier/tracking details can be edited.
No stock, reservation, order, payment or refund values are written.

## HTTP contracts

All routes use `{ success: true, ... }` on success and `{ error: string }` on error.
Errors: 400 invalid payload/transition; 404 missing record; 409 conflict, duplicate
active record/tracking number, ineligible state or retryable concurrency failure;
503 missing migration or unavailable/unconfirmed operation.

- `GET /api/fulfillment` and `GET /api/shipments`: `search`, `status`, 1-based `page`
  (default 1), `pageSize` (default 10, max 100). Literal case-insensitive search;
  stable descending record ID ordering. Returns `{ records, total, page, pageSize,
  eligible, ready }`. Eligible choices are independent of list filters and contain
  all qualifying items/fulfillments, appropriate for this mini-project's scale.
- `GET /api/fulfillment/[id]`, `GET /api/shipments/[id]`: `{ record }` with order,
  customer, item, product, quantity, status, dates, and migration readiness.
- `POST /api/fulfillment`: `{ orderItemId: number }`.
- `PATCH /api/fulfillment/[id]`: `{ currentStatus, newStatus }`.
- `POST /api/shipments`: `{ fulfillmentId: number, courier: string,
  trackingNo?: string | null }`.
- `PATCH /api/shipments/[id]`: `{ currentStatus: "PENDING", newStatus: "PENDING",
  courier: string, trackingNo?: string | null, expectedCourier: string,
  expectedTrackingNo: string | null }`. Expected values detect concurrent edits.
- POST returns HTTP 201; PATCH returns 200; both return `{ record }` using the
  database row's column names. GET normalizes the record's primary key to `id`.

Unrecognized mutation fields are rejected, including client-provided timestamps,
inventory quantities and forbidden statuses. Courier is trimmed and required;
tracking is trimmed and empty values become NULL. Both are at most 100 characters.

No builds, tests, installations, Git commands or migrations were run. Manual
review/application and user-run verification are still required. Stage B must
design stock consumption/idempotency before exposing dispatch or delivery.
