import type { Metadata } from "next";
import CreateTicket from "../create-ticket";
export const metadata: Metadata = { title: "Create Ticket | OmniLock" };
export default function NewTicketPage() { return <CreateTicket />; }
