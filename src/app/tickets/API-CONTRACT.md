# Support tickets frontend integration

This frontend uses real HTTP APIs only. It does not create a MongoDB connection,
seed records, or substitute sample tickets. Existing global OmniLock layout and
shared Panel, DataTable, EmptyState and StatCard components are reused.

## APIs owned by Tarun (absent from this checkout)

These are **expected contracts**, not claims about an existing implementation.
Coordinate with Tarun before integration; adapt `ticket-api.ts` if his agreed
response envelope differs. JSON dates must be ISO strings, `_id` a serialized
24-character MongoDB ObjectId, and `orderId` a positive safe-integer number.

Ticket detail shape:

```ts
type Ticket = {
  _id: string;
  orderId: number;
  issueType: string;
  description: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  createdAt: string;
  updatedAt: string;
  messages: {
    sender: "CUSTOMER" | "SUPPORT";
    text: string;
    createdAt: string;
  }[];
};
```

- `GET /api/tickets?search=&status=&issueType=&page=1&pageSize=10`
  returns `{ success: true, tickets: Ticket[], total: number, page: number,
  pageSize: number }`. List records may omit `messages` and `description`.
  `total` is the count after filtering, before pagination; page is 1-based.
  Empty status/issueType/search means no corresponding filter. Search covers
  ticket ID, order ID (accept an optional # prefix), and description; issue type
  and status are exact filters. Apply stable newest-first ordering with `_id`
  as a tie-breaker. Honor pagination even for empty/out-of-range pages.
- `POST /api/tickets` accepts `{ orderId: number, issueType: string,
  description: string }`; returns HTTP 201 `{ success: true, ticket: Ticket }`.
  The backend must validate order existence, issue type and description limits.
  No local MongoDB schema or issue-type enum was found: the frontend therefore
  accepts an issue-type string instead of inventing allowed values. Agree on
  the enum with Tarun and replace this field with a select once available.
- `GET /api/tickets/[id]` returns `{ success: true, ticket: Ticket }` including
  messages in chronological order; JSON 404 `{ error: "Ticket not found" }`
  for a missing ticket. All validation/server errors use `{ error: string }`
  with an appropriate non-2xx HTTP status and safe user-facing wording.

Until these routes exist, listing/create/detail show an integration error.
Analytics can work independently. A malformed response is an error, not an
empty database. Search/filter pagination happens on the server; no local
slice is presented as a complete dataset.

## Existing APIs inspected and integrated unchanged

- `POST /api/tickets/[id]/messages`: `{ sender: "CUSTOMER" | "SUPPORT",
  text: string }`; response `{ success: true, message: string }`. Enforces
  1–2000 characters and at most 100 embedded messages. A 404 may mean the
  message limit was reached or the ticket was removed. The frontend reloads
  detail after every mutation attempt, preserves failed drafts and guards
  repeated submissions. Unknown mutation outcomes require inspecting the
  conversation before explicitly enabling another submission.
- `PATCH /api/tickets/[id]/status`: `{ currentStatus, newStatus }` with only
  OPEN → IN_PROGRESS → RESOLVED supported. Response `{ success: true,
  previousStatus, newStatus, message }`. HTTP 409 `{ error, actualStatus }`
  triggers a detail reload; no automatic mutation retry occurs. If reload
  fails, editing is unavailable until a successful reload.
- `GET /api/tickets/analytics`: `{ success: true, totalTickets,
  statusCounts: { OPEN, IN_PROGRESS, RESOLVED },
  issueTypeCounts: [{ issueType, count }], mostCommonIssue }`.
  Analytics is global, independent of listing filters. Unavailable counts
  are displayed as em dashes, never invented zeros.

Sender selection follows the existing demonstration API; it is not an
authorization mechanism. No authentication or backend behavior was added.
All timestamps are displayed in the browser's local timezone using en-IN.
No builds, tests, installations or Git commands were run for this frontend.
