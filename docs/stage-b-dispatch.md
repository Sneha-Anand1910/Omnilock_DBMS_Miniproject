# Stage B: atomic dispatch and delivery

Manually apply `migrations/20261103_stage_b_dispatch_delivery.sql` once, after
Stage A and the cancellation/refund migration. Nothing applies it automatically.
It adds `inventory_dispatch`, extends the existing reservation status check with
`CONSUMED`, and installs four new functions and three safety triggers. No existing
function is replaced and applying the migration does not update business records.
The constraint change takes a table lock; unexpected status constraints fail closed.

## Workflow and API

1. Use existing Stage A preparation to reach PACKED, then create a PENDING shipment.
2. `POST /api/fulfillment/[id]` with `{ "currentStatus": "PACKED" }` dispatches stock.
   Returns `{ success, record, alreadyDispatched }`; a verified retry returns prior
   success without deducting anything again.
3. `PUT /api/shipments/[id]` with `{ "currentStatus", "newStatus" }` advances only
   PENDING → SHIPPED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED.
   Returns `{ success, record }`. Stale/repeated transitions return HTTP 409.

Collection POST, detail GET, and Stage A PATCH contracts remain intact. Courier
and tracking edits remain a pre-dispatch operation. SHIPPED sets ship_date;
DELIVERED sets delivery_date. Intermediate dates are not invented in the timeline.
RETURNED/CANCELLED transitions are rejected; no restock or refund is automatic.
Separate migration readiness disables new controls until Stage B is installed.

## Atomicity and compatibility

Dispatch locks order → payments → order item → inventory IDs ascending (NOWAIT)
→ reservation IDs ascending → fulfillment → shipment. The order lock serializes
payment, cancellation, preparation and dispatch for the same order. NOWAIT avoids
inventory wait cycles with the previously inspected expiry batch, which retains
locks across pending orders. Busy/serialization/deadlock failures return HTTP 409;
the UI refreshes instead of automatically retrying a mutation.

Payment evidence, confirmed reservation coverage and the complete inventory hold
counter are rechecked under locks. Each reservation has one immutable ledger row.
Both stock counters are deducted and the reservation becomes CONSUMED in the same
transaction. Fulfillment becomes FULFILLED afterward; the order becomes FULFILLED
only when all items have matching dispatched quantities. No payment values change.

Existing cancellation releases ACTIVE/CONFIRMED holds only and rejects active
fulfillment, including partially dispatched orders. Previously inspected expiry
handles ACTIVE holds on PENDING orders. Neither releases CONSUMED reservations.
Additional triggers protect consumed reservations and ledger entries from changes
and reject cancellation of any order with dispatch evidence. No procedure rewrite
is required. Reservation listing already derives its filter statuses from records.

Live function definitions were not re-queried: database queries, SQL execution,
builds, tests, installations and Git commands were prohibited. Compatibility relies
on the previously verified schema/functions and the checked-in migrations; this
implementation has not been executed or tested. The expiry body is not checked in.
