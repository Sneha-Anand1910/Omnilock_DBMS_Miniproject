import type { Metadata } from "next";
import { connection } from "next/server";
import { getInventory } from "@/lib/inventory";
import { LOW_STOCK_THRESHOLD } from "@/lib/dashboard";
import { RefreshButton } from "@/components/omnilock/shell";
import InventoryTable from "./inventory-table";

export const metadata: Metadata = { title: "Inventory | OmniLock" };

export default async function InventoryPage() {
  await connection();
  const data = await getInventory();
  return <>
    <div className="page-heading">
      <div><p className="eyebrow">STOCK ACROSS YOUR WORKSPACE</p><h1>Inventory management</h1><p>Find products and monitor availability across your warehouses.</p></div>
      <RefreshButton />
    </div>
    {data ? <InventoryTable records={data.records} warehouses={data.warehouses} threshold={LOW_STOCK_THRESHOLD} /> :
      <section className="panel" aria-labelledby="inventory-error-title">
        <div className="panel-heading"><div><h2 id="inventory-error-title">Inventory unavailable</h2><p role="alert">We could not load inventory from the database. Please try Refresh data again.</p></div></div>
        <div className="panel-footnote">No inventory quantities are shown while the connection is unavailable.</div>
      </section>}
  </>;
}
