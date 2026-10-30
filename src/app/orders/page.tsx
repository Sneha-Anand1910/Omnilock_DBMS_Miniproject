import type { Metadata } from "next";
import { connection } from "next/server";
import { getOrders } from "@/lib/orders";
import OrdersView from "./orders-view";

export const metadata: Metadata = { title: "Orders | OmniLock" };

export default async function OrdersPage() {
  await connection();
  return <OrdersView orders={await getOrders()} />;
}
