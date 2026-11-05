import { displayDateTime } from "@/lib/display-time";

export const statuses = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export type TicketStatus = typeof statuses[number];
export type Ticket = {
  _id: string; orderId: number; issueType: string; description: string;
  status: TicketStatus; createdAt: string; updatedAt: string;
  messages: { sender: "CUSTOMER" | "SUPPORT"; text: string; createdAt: string }[];
};
export type TicketList = { tickets: Ticket[]; total: number; page: number; pageSize: number };
export type Analytics = { totalTickets: number; statusCounts: Record<TicketStatus, number>; issueTypeCounts: { issueType: string; count: number }[] };
export const label = (value: string) => value.replaceAll("_", " ").toLowerCase();
export const date = (value: string) => displayDateTime(value);
export const isStatus = (value: unknown): value is TicketStatus => statuses.some(status => status === value);
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function count(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function timestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
export function ticket(value: unknown, detail = true): Ticket {
  if (!record(value) || typeof value._id !== "string" || !/^[a-f\d]{24}$/i.test(value._id) || !count(value.orderId) || value.orderId < 1 || typeof value.issueType !== "string" || !isStatus(value.status) || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || (detail && (typeof value.description !== "string" || !Array.isArray(value.messages)))) throw new Error("Ticket response does not match the documented frontend API contract.");
  const messages = value.messages ?? [];
  if (!Array.isArray(messages) || messages.some(message => !record(message) || !["CUSTOMER", "SUPPORT"].includes(String(message.sender)) || typeof message.text !== "string" || !timestamp(message.createdAt))) throw new Error("Invalid conversation response.");
  return { ...value, description: typeof value.description === "string" ? value.description : "", messages } as Ticket;
}
export function ticketList(value: unknown): TicketList {
  if (!record(value) || !Array.isArray(value.tickets) || !count(value.total) || !count(value.page) || value.page < 1 || !count(value.pageSize) || value.pageSize < 1) throw new Error("Ticket listing does not match the documented frontend API contract.");
  return { tickets: value.tickets.map(item => ticket(item, false)), total: value.total, page: value.page, pageSize: value.pageSize };
}
export function analytics(value: unknown): Analytics {
  if (!record(value) || !count(value.totalTickets) || !record(value.statusCounts) || !statuses.every(status => count((value.statusCounts as Record<string, unknown>)[status])) || !Array.isArray(value.issueTypeCounts) || value.issueTypeCounts.some(item => !record(item) || typeof item.issueType !== "string" || !count(item.count))) throw new Error("Invalid analytics response.");
  return value as Analytics;
}
export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function request(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const timeout = AbortSignal.timeout(15_000);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init, signal });
  } catch (error) {
    if (timeout.aborted && !init?.signal?.aborted) throw new ApiError("Ticket service timed out. Check MongoDB connectivity and retry.", 503);
    throw error;
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(record(body) && typeof body.error === "string" ? body.error : record(body) && typeof body.message === "string" ? body.message : response.status === 503 ? "Ticket service unavailable. Check MongoDB connectivity and retry." : `Request failed (${response.status}). Please try again.`, response.status);
  if (!record(body) || body.success === false) throw new ApiError("Unexpected API response. Check the documented ticket API contract.", response.status);
  return body;
}
export const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to load tickets.";
