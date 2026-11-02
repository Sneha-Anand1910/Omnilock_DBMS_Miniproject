import "server-only";
import { NextResponse } from "next/server";

type Action = "dispatch" | "transition";
class Invalid extends Error {}
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});
const transitions: Record<string, string> = {
  PENDING: "SHIPPED", SHIPPED: "IN_TRANSIT", IN_TRANSIT: "OUT_FOR_DELIVERY", OUT_FOR_DELIVERY: "DELIVERED",
};

export async function dispatchAction(request: Request, value: string, action: Action) {
  try {
    const id = Number(value);
    if (!/^[1-9]\d*$/.test(value) || !Number.isInteger(id) || id > 2147483647) throw new Invalid("Invalid record ID.");
    let parsed: unknown;
    try { parsed = await request.json(); } catch { throw new Invalid("Invalid JSON body."); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Invalid("Request body must be an object.");
    const body = parsed as Record<string, unknown>;
    const allowed = action === "dispatch" ? ["currentStatus"] : ["currentStatus", "newStatus"];
    if (Object.keys(body).some(key => !allowed.includes(key))) throw new Invalid("Unsupported fields. Stock quantities and timestamps are controlled by PostgreSQL.");
    if (action === "dispatch") {
      if (body.currentStatus !== "PACKED") throw new Invalid("Dispatch requires expected status PACKED.");
    } else if (typeof body.currentStatus !== "string" || typeof body.newStatus !== "string" ||
      !Object.hasOwn(transitions, body.currentStatus) || transitions[body.currentStatus] !== body.newStatus) {
      throw new Invalid("Use PENDING → SHIPPED → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED. Returns and cancellation are unsupported.");
    }
    const { sql } = await import("@/lib/neon-http");
    // Each request is one atomic PostgreSQL function call, never client-side stock writes.
    if (action === "dispatch") {
      const rows = await sql`SELECT public.stage_b_dispatch_fulfillment(${id}::integer,${body.currentStatus as string}::text) AS result`;
      return json({ success: true, ...rows[0].result });
    }
    const rows = await sql`SELECT public.stage_b_transition_shipment(${id}::integer,${body.currentStatus as string}::text,${body.newStatus as string}::text) AS record`;
    return json({ success: true, record: rows[0].record });
  } catch (error) {
    if (error instanceof Invalid) return json({ error: error.message }, 400);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (["P4000", "P4040", "P4090"].includes(code)) return json({
      error: error instanceof Error ? error.message : "The record no longer permits this action. Refresh and review it.",
    }, code === "P4000" ? 400 : code === "P4040" ? 404 : 409);
    if (["42883", "42P01"].includes(code)) return json({ error: "Stage B is unavailable until migrations/20261103_stage_b_dispatch_delivery.sql is applied manually." }, 503);
    if (["55P03", "40P01", "40001"].includes(code)) return json({ error: "Another inventory or order operation is in progress. Refresh and review before retrying; no partial dispatch was committed." }, 409);
    if (["23505", "23503", "23514"].includes(code)) return json({ error: "Dispatch conflicts with the current ledger or database constraints. Refresh and review the record." }, 409);
    console.error("OmniLock dispatch/delivery request unavailable.");
    return json({ error: "The result could not be confirmed. Refresh the record before retrying." }, 503);
  }
}
