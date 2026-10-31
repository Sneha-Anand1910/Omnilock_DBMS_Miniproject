export default function PaymentsLoading() {
  return <div className="loading-state" role="status"><span className="loading-dot" aria-hidden="true" /><h1>Loading payments</h1><p>Fetching payment history and eligible orders…</p></div>;
}
