import type { NextRequest } from "next/server";
import { Int32, MongoServerError, ObjectId, type Filter } from "mongodb";
import { failure, issueTypes, json, serializeTicket, statuses, ticketCollection, type TicketDocument } from "./ticket-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return failure("Invalid JSON body", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return failure("Request body must be an object", 400);
  const { orderId, issueType, description } = body as Record<string, unknown>;
  if (typeof orderId !== "number" || !Number.isInteger(orderId) || orderId < 1 || orderId > 2147483647) {
    return failure("Order ID must be a positive integer no greater than 2147483647", 400);
  }
  if (typeof issueType !== "string" || !issueTypes.some(value => value === issueType)) {
    return failure("Issue type must be DELIVERY, PAYMENT, REFUND, PRODUCT or OTHER", 400);
  }
  if (typeof description !== "string") return failure("Description must be a string", 400);
  const normalizedDescription = description.trim();
  // Count Unicode code points, matching JSON Schema string-length semantics.
  const descriptionLength = Array.from(normalizedDescription).length;
  if (descriptionLength < 5 || descriptionLength > 1000) {
    return failure("Description must contain 5–1000 characters after trimming whitespace", 400);
  }

  try {
    const { sql } = await import("@/lib/neon-http");
    const orders = await sql`SELECT order_id FROM orders WHERE order_id = ${orderId} LIMIT 1`;
    if (!orders.length) return failure("Order not found", 404);
    const tickets = await ticketCollection();
    const now = new Date();
    const ticket: TicketDocument = {
      _id: new ObjectId(), orderId: new Int32(orderId),
      issueType: issueType as TicketDocument["issueType"], description: normalizedDescription,
      status: "OPEN", messages: [], createdAt: now, updatedAt: now,
    };
    // Do not bypass the collection's existing strict validator.
    await tickets.insertOne(ticket);
    return json({ success: true, ticket: serializeTicket(ticket) }, 201);
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 121) {
      return failure("Ticket does not meet the collection validation rules. Check the description length and ticket details.", 400);
    }
    if (error instanceof MongoServerError && error.code === 11000) return failure("A ticket with these unique details already exists", 409);
    console.error("OmniLock tickets: creation unavailable.");
    return failure("Unable to create ticket", 500);
  }
}

function positiveInteger(value: string | null, fallback: number) {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const page = positiveInteger(params.get("page"), 1);
  const pageSize = positiveInteger(params.get("pageSize"), 10);
  if (page === null || pageSize === null || pageSize > 100 || !Number.isSafeInteger((page - 1) * pageSize)) {
    return failure("Page must be a positive integer and pageSize must be between 1 and 100", 400);
  }
  const status = params.get("status") ?? "";
  const issueType = params.get("issueType") ?? "";
  if (status && !statuses.some(value => value === status)) return failure("Invalid ticket status", 400);
  if (issueType && !issueTypes.some(value => value === issueType)) return failure("Invalid issue type", 400);
  const search = (params.get("search") ?? "").trim();
  const filter: Filter<TicketDocument> = {};
  if (status) filter.status = status as TicketDocument["status"];
  if (issueType) filter.issueType = issueType as TicketDocument["issueType"];
  if (search) {
    // Literal matching prevents search text from injecting regular expressions.
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const alternatives: Filter<TicketDocument>[] = [{ description: { $regex: escaped, $options: "i" } }];
    if (/^[a-f\d]{24}$/i.test(search)) alternatives.push({ _id: new ObjectId(search) });
    const orderText = search.replace(/^#/, "");
    const orderId = Number(orderText);
    if (/^\d+$/.test(orderText) && Number.isInteger(orderId) && orderId > 0 && orderId <= 2147483647) {
      alternatives.push({ orderId: new Int32(orderId) });
    }
    filter.$or = alternatives;
  }
  try {
    const tickets = await ticketCollection();
    const [result] = await tickets.aggregate<{ tickets: TicketDocument[]; total: { count: number }[] }>([
      { $match: filter },
      { $sort: { createdAt: -1, _id: -1 } },
      { $facet: {
        tickets: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        total: [{ $count: "count" }],
      } },
    ]).toArray();
    return json({ success: true, tickets: (result?.tickets ?? []).map(serializeTicket), total: result?.total[0]?.count ?? 0, page, pageSize });
  } catch {
    console.error("OmniLock tickets: listing unavailable.");
    return failure("Unable to load tickets", 500);
  }
}
