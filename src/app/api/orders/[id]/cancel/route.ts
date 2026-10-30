import { NextResponse } from "next/server";

export const runtime = "nodejs";

const conflicts: Record<string, string> = {
  P4091: "This order cannot be cancelled because fulfillment or shipment has started.",
  P4092: "The order's current status does not permit cancellation.",
  P4093: "Order payment/refund history is inconsistent. Manual reconciliation is required; no cancellation changes were applied.",
  P4094: "Inventory holds are inconsistent. Manual reconciliation is required; no cancellation changes were applied.",
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const orderId = Number(id);
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(orderId) || orderId > 2147483647) {
    return NextResponse.json({ success: false, message: "Invalid order ID" }, { status: 400 });
  }
  try {
    const { sql } = await import("@/lib/neon-http");
    // One SQL statement: all cancellation, ledger and stock updates commit together.
    // Calling the new entry point intentionally fails closed before migration.
    const result = await sql`SELECT public.cancel_order_with_refund(${orderId}::integer) AS cancellation`;
    return NextResponse.json({ success: true, ...result[0].cancellation });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "P4040") return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    if (code === "P4001") return NextResponse.json({ success: false, message: "Invalid order ID" }, { status: 400 });
    if (conflicts[code]) return NextResponse.json({ success: false, message: conflicts[code] }, { status: 409 });
    if (code === "42883" || code === "42P01") {
      return NextResponse.json({ success: false, message: "Safe cancellation is unavailable until the cancellation/refund migration is applied." }, { status: 503 });
    }
    if (code === "40001" || code === "40P01") {
      return NextResponse.json({ success: false, message: "A concurrent operation prevented cancellation. Refresh the order and retry." }, { status: 409 });
    }
    console.error("OmniLock safe cancellation failed.");
    return NextResponse.json({ success: false, message: "Cancellation could not be confirmed. Refresh the order before retrying." }, { status: 503 });
  }
}
