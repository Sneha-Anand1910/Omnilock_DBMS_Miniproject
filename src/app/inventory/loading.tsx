export default function InventoryLoading() {
  return <div className="loading-state" role="status" aria-live="polite"><span className="loading-dot" aria-hidden="true" /><h1>Loading inventory</h1><p>Fetching current stock and warehouse records…</p></div>;
}
