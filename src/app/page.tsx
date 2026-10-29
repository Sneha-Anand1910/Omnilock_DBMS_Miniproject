import Link from "next/link";
import { connection } from "next/server";
import { getDashboard, LOW_STOCK_THRESHOLD } from "@/lib/dashboard";
import { Icon } from "@/components/omnilock/icons";
import { RefreshButton } from "@/components/omnilock/shell";
import { DataTable, EmptyState, Panel, StatCard, StatusBadge } from "@/components/omnilock/ui";

export default async function Home() {
  await connection();
  const data = await getDashboard();
  const stats = data?.stats;
  return <>
    <div className="page-heading"><div><p className="eyebrow">YOUR OPERATIONS, AT A GLANCE</p><h1>Dashboard overview</h1><p>Stay on top of your inventory, orders, and everything in between.</p></div><RefreshButton /></div>
    <div className={`data-banner ${data ? "" : "unavailable"}`} role="status"><span className="connection-dot" /><strong>{data ? "Connected to Neon PostgreSQL" : "Database temporarily unavailable"}</strong><span>{data ? `Snapshot updated ${new Date(data.updated).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST` : "Statistics could not be loaded. Check the server connection and refresh."}</span><span className="banner-tag">{data ? "LIVE DATABASE" : "NO DATA LOADED"}</span></div>
    <div className="stats-grid">
      <StatCard label="Total products" value={stats?.products} detail="Products in your catalog" icon="products" />
      <StatCard label="Total orders" value={stats?.orders} detail="Across all sales channels" icon="orders" />
      <StatCard label="Available stock" value={stats?.available} detail="On-hand stock minus reserved" icon="inventory" accent="teal" />
      <StatCard label="Reserved stock" value={stats?.reserved} detail="Units currently held in inventory" icon="lock" accent="violet" />
      <StatCard label="Active reservations" value={stats?.active} detail="Active and not yet expired" icon="reservations" accent="amber" />
      <StatCard label="Confirmed orders" value={stats?.confirmed} detail="Orders with confirmed status" icon="fulfillment" accent="teal" />
    </div>
    <div className="dashboard-columns"><div className="primary-panels">
      <Panel title="Recent orders" subtitle="The latest activity across your sales channels" action={<Link className="text-link" href="/orders">Orders <Icon name="arrow" /></Link>}>
        {!data ? <EmptyState message="Order data is unavailable." /> : !data.orders.length ? <EmptyState message="No orders yet. New orders will appear here." /> : <DataTable headers={["Order", "Customer", "Channel", "Status"]} caption="Six most recent orders"><>{data.orders.map(order => <tr key={order.order_id}><td><strong className="order-id">#{order.order_id}</strong><small>{order.order_date ?? "Date unavailable"}</small></td><td>{order.customer}</td><td><span className="channel">{order.channel?.toLowerCase() ?? "—"}</span></td><td><StatusBadge status={order.status} /></td></tr>)}</></DataTable>}
        <div className="panel-footnote">Latest 6 orders · Dates as recorded in the database</div>
      </Panel>
      <Panel title="Inventory availability" subtitle="Stock by product and warehouse, lowest availability first" action={<Link className="text-link" href="/inventory">Inventory <Icon name="arrow" /></Link>}>
        {!data ? <EmptyState message="Inventory data is unavailable." /> : !data.inventory.length ? <EmptyState message="No inventory records yet." /> : <DataTable headers={["Product", "Warehouse", "On hand", "Reserved", "Available"]} caption="Inventory availability by product and warehouse"><>{data.inventory.map(item => <tr key={item.inventory_id}><td><strong>{item.product_name}</strong><small>{item.sku}</small></td><td>{item.warehouse}</td><td className="numeric">{item.stock}</td><td className="numeric muted">{item.reserved}</td><td className="numeric"><span className={`stock-value ${item.available <= LOW_STOCK_THRESHOLD ? "stock-low" : ""}`}>{item.available}</span></td></tr>)}</></DataTable>}
        <div className="panel-footnote">Up to 8 product–warehouse records · Available = on hand − reserved</div>
      </Panel>
    </div><div className="secondary-panels">
      <Panel title="Low-stock alerts" subtitle={`Available stock ≤ ${LOW_STOCK_THRESHOLD} units per location`} action={<span className="alert-count">{stats?.low_stock ?? "—"}</span>}>
        {!data ? <EmptyState message="Stock alerts are unavailable." /> : !data.alerts.length ? <EmptyState message="All stocked locations are above the alert threshold." /> : <div className="alerts-list">{data.alerts.map(item => <div className="alert-item" key={item.inventory_id}><span className="alert-icon"><Icon name="alert" /></span><div><strong>{item.product_name}</strong><small>{item.warehouse} · {item.sku}</small><span className={`remaining ${item.available <= 0 ? "danger" : ""}`}>{item.available <= 0 ? `${item.available} units available · Out of stock` : `${item.available} units available`}</span></div></div>)}</div>}
        <div className="panel-footnote">Showing up to 5 alerts · Dashboard threshold: {LOW_STOCK_THRESHOLD}</div>
      </Panel>
      <section className="quick-panel"><span className="quick-icon"><Icon name="shipments" /></span><h2>Keep operations moving</h2><p>Find the right workspace for each step of the order lifecycle.</p><Link href="/reservations">Review reservations <Icon name="arrow" /></Link><Link href="/fulfillment">Go to fulfillment <Icon name="arrow" /></Link><Link href="/shipments">Track shipments <Icon name="arrow" /></Link></section>
      <div className="info-note"><Icon name="lock" /><p><strong>A clear view of your data</strong>This dashboard reads your existing records. Refresh to see the latest changes.</p></div>
    </div></div>
  </>;
}
