export function Icon({ name, className = "" }: { name: string; className?: string }) {
  const paths: Record<string, string> = {
    dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    inventory: "M4 7h16v14H4z M3 3h18v4H3z M9 11h6",
    products: "m12 3 9 5-9 5-9-5 9-5z M3 8v9l9 5 9-5V8 M12 13v9 M7 5l10 6",
    warehouses: "M3 21V8l9-5 9 5v13 M7 21V11h10v10 M7 15h10 M7 18h10",
    orders: "M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4",
    reservations: "M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    payments: "M3 5h18v14H3z M3 9h18 M7 15h3",
    fulfillment: "m8 12 3 3 5-6 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
    shipments: "M3 5h11v12H3z M14 9h4l3 4v4h-7 M8 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0 M20 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
    customers: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2",
    categories: "M3 3h8l10 10-8 8L3 11z M7 7h.01",
    lock: "M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3",
    arrow: "M5 12h14 M14 7l5 5-5 5",
    refresh: "M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M4 12a8 8 0 0 0 14 6",
    alert: "m12 3 10 18H2L12 3z M12 9v5 M12 17h.01",
    menu: "M4 6h16 M4 12h16 M4 18h16",
    close: "m6 6 12 12 M6 18 18 6",
  };
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] ?? paths.products} /></svg>;
}
