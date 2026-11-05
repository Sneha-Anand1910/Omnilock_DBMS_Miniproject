import "server-only";
import { Int32, ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export const issueTypes = ["DELIVERY", "PAYMENT", "REFUND", "PRODUCT", "OTHER"] as const;
export const statuses = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export type TicketDocument = {
  _id: ObjectId;
  orderId: Int32 | number;
  issueType: typeof issueTypes[number];
  description: string;
  status: typeof statuses[number];
  createdAt: Date;
  updatedAt: Date;
  messages: { sender: "CUSTOMER" | "SUPPORT"; text: string; createdAt: Date }[];
};

export async function ticketCollection() {
  const { getMongoClient } = await import("@/lib/mongodb");
  const client = await getMongoClient();
  return client.db("omnilock_support").collection<TicketDocument>("tickets");
}

export function serializeTicket(ticket: TicketDocument) {
  return {
    _id: ticket._id.toHexString(),
    orderId: Number(ticket.orderId),
    issueType: ticket.issueType,
    description: ticket.description,
    status: ticket.status,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    messages: [...ticket.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(message => ({ sender: message.sender, text: message.text, createdAt: message.createdAt.toISOString() })),
  };
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function failure(error: string, status: number) { return json({ error }, status); }
