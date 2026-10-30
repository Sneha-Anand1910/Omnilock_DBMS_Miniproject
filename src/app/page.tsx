
const stats = [
  { label: "Total Customers", value: "—", icon: "👥" },
  { label: "Product Categories", value: "—", icon: "🏷️" },
  { label: "Products", value: "—", icon: "📦" },
  { label: "Pending Orders", value: "—", icon: "🛒" },
];

const modules = [
  {
    title: "Customer Management",
    description: "View and manage customer information.",
    href: "/customers",
    icon: "👥",
  },
  {
    title: "Category Management",
    description: "Organize products into categories.",
    href: "/categories",
    icon: "🏷️",
  },
  {
    title: "Product Listing",
    description: "Browse and search products.",
    href: "/products",
    icon: "📦",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <aside className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <p className="text-2xl font-bold tracking-tight text-blue-700">
              OmniLock
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Omnichannel Inventory & Order Fulfillment
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
            Admin Panel
          </span>
        </div>
      </aside>

      <div className="mx-auto max-w-7xl px-6 py-10">
        <section className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">
            Dashboard
          </p>
          <h1 className="mt-2 text-3xl font-bold">
            Welcome to OmniLock
          </h1>
          <p className="mt-2 text-slate-600">
            Manage customers, categories, and products from one place.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <span className="text-2xl">{stat.icon}</span>
              <p className="mt-4 text-sm text-slate-500">{stat.label}</p>
              <p className="mt-1 text-3xl font-bold">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-bold">Management Modules</h2>
          <p className="mt-1 text-sm text-slate-500">
            Select a module to get started.
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {modules.map((module) => (
              <a
                key={module.title}
                href={module.href}
                className="group rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-md"
              >
                <span className="text-3xl">{module.icon}</span>
                <h3 className="mt-4 text-lg font-semibold group-hover:text-blue-700">
                  {module.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {module.description}
                </p>
                <p className="mt-5 text-sm font-semibold text-blue-700">
                  Open module →
                </p>
              </a>
            ))}
          </div>
        </section>

        <footer className="mt-12 border-t border-slate-200 pt-5 text-sm text-slate-500">
          OmniLock DBMS Mini Project
        </footer>
      </div>
    </main>
  );
}
