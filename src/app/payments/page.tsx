import type { Metadata } from "next";
import { connection } from "next/server";
import { getPayments } from "@/lib/payments";
import PaymentsView from "./payments-view";

export const metadata: Metadata = { title: "Payments | OmniLock" };
export default async function PaymentsPage() {
  await connection();
  return <PaymentsView data={await getPayments()} />;
}
