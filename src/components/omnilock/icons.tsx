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
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35",
    soundOn: "M11 5L6 9H2v6h4l5 4V5z M19.07 4.93a10 10 0 0 1 0 14.14 M15.54 8.46a5 5 0 0 1 0 7.07",
    soundOff: "M11 5L6 9H2v6h4l5 4V5z M23 9l-6 6 M17 9l6 6",
    cube3d: "M21 16.5V7.5L12 2 3 7.5v9l9 5.5 9-5.5z M3.27 7.72L12 12.5l8.73-4.78 M12 22.5V12.5",
    viewTable: "M3 3h18v18H3z M3 9h18 M3 15h18 M9 9v12 M15 9v12",
    chevronLeft: "M15 18l-6-6 6-6",
    chevronRight: "M9 18l6-6-6-6",
    check: "M20 6L9 17l-5-5",
    radar: "M12 22a10 10 0 1 0-10-10 10 10 0 0 0 10 10z M12 18a6 6 0 1 0-6-6 6 6 0 0 0 6 6z M12 14a2 2 0 1 0-2-2 2 2 0 0 0 2 2z M12 2v4",
  };
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] ?? paths.products} />
    </svg>
  );
}
