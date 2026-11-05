import "server-only";

// The transaction-scoped advisory lock prevents two app instances or a scheduled
// request from processing expiry simultaneously. The SQL function still owns all
// order/inventory/reservation row locks and performs the stock release atomically.
export async function expireHolds() {
  const { sql } = await import("@/lib/neon-http");
  const rows = await sql`
    SELECT CASE WHEN pg_try_advisory_xact_lock(730516, 35)
      THEN public.expire_reservations() ELSE 0 END AS expired_count
  `;
  return Number(rows[0].expired_count);
}
