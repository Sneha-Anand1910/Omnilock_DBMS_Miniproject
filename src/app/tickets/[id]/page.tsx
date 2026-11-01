import type { Metadata } from "next";
import TicketDetails from "../ticket-details";
export const metadata: Metadata = { title: "Ticket Details | OmniLock" };
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketDetails key={id} id={id} />;
}
