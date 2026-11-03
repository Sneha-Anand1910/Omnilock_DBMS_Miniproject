import type { Metadata } from "next";
import InventoryAnalyticsView from "./inventory-analytics-view";

export const metadata: Metadata = { title: "Inventory Analytics | OmniLock" };

export default function InventoryAnalyticsPage() {
  return <InventoryAnalyticsView />;
}
