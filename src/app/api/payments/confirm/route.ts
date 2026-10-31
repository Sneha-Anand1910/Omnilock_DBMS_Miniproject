import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ success: false, message: "Invalid JSON body." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ success: false, message: "Invalid payment details." }, { status: 400 });
  }
  const { orderId, method } = body as Record<string, unknown>;
  if (typeof orderId !== "number" || !Number.isSafeInteger(orderId) || orderId <= 0 || orderId > 2147483647 ||
      typeof method !== "string" || !["UPI", "CARD", "NET_BANKING"].includes(method)) {
    return NextResponse.json({ success: false, message: "Select a valid order and payment method." }, { status: 400 });
  }
  try {
    const { sql } = await import("@/lib/neon-http");
    const orders = await sql`SELECT status, total_amount > 0 AS positive_amount FROM orders WHERE order_id = ${orderId}`;
    if (!orders.length) return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
    if (orders[0].status !== "PENDING" || !orders[0].positive_amount) {
      return NextResponse.json({ success: false, message: "Only pending orders with a positive total can be paid." }, { status: 409 });
    }
    const transactionRef = `SIM-${randomUUID()}`;
    // The existing function locks the order, rejects duplicate successful payments,
    // rechecks status/reservations, and records payment + confirmation atomically.
    // Never accept a client-supplied amount or a client-supplied success status.
    const result = await sql`SELECT confirm_payment(${orderId}::integer, ${method}::varchar, ${transactionRef}::varchar) AS payment_id`;
    return NextResponse.json({ success: true, paymentId: result[0].payment_id, orderId, transactionRef, message: "Simulated payment confirmed. No money was charged." }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = ["Order is already paid", "Payment rejected: Missing or expired inventory reservation", "Invalid payment method", "Transaction reference is required"].includes(message) || /^Payment not allowed: Order status is (PENDING|CONFIRMED|CANCELLED|FULFILLED)$/.test(message);
    if (known) return NextResponse.json({ success: false, message }, { status: 409 });
    if (/^Order \d+ not found$/.test(message)) return NextResponse.json({ success: false, message: "Order not found." }, { status: 404 });
    console.error("OmniLock payments: confirmation unavailable.");
    return NextResponse.json({ success: false, message: "Payment confirmation could not be verified. Refresh payment history before retrying." }, { status: 503 });
  }
}
