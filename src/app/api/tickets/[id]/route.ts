import type { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { failure, json, serializeTicket, ticketCollection } from "../ticket-store";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-f\d]{24}$/i.test(id)) return failure("Invalid ticket ID", 400);
  try {
    const tickets = await ticketCollection();
    const ticket = await tickets.findOne({ _id: new ObjectId(id) });
    if (!ticket) return failure("Ticket not found", 404);
    return json({ success: true, ticket: serializeTicket(ticket) });
  } catch {
    console.error("OmniLock tickets: detail unavailable.");
    return failure("Ticket service unavailable. Check MongoDB connectivity and retry.", 503);
  }
}
