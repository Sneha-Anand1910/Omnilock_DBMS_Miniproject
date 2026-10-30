import type { Metadata } from "next";
import { connection } from "next/server";
import { getReservations } from "@/lib/reservations";
import ReservationsView from "./reservations-view";

export const metadata: Metadata = { title: "Reservations | OmniLock" };
export default async function ReservationsPage() {
  await connection();
  return <ReservationsView data={await getReservations()} />;
}
