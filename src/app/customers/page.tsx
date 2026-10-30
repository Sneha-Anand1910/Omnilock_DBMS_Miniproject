
"use client";

import { useState } from "react";

type Customer = {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
};

const initialCustomers: Customer[] = [
  {
    id: 1,
    name: "Rahul Sharma",
    email: "rahul@example.com",
    phone: "9876543210",
    address: "Bengaluru",
  },
  {
    id: 2,
    name: "Priya Kumar",
    email: "priya@example.com",
    phone: "9876543211",
    address: "Chennai",
  },
];

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const filteredCustomers = customers.filter((customer) =>
    `${customer.name} ${customer.email} ${customer.phone} ${customer.address}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  function resetForm() {
    setName("");
    setEmail("");
    setPhone("");
    setAddress("");
    setEditingId(null);
  }

  function saveCustomer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const customerData = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
    };

    if (
      customers.some(
        (customer) =>
          customer.email.toLowerCase() === customerData.email.toLowerCase() &&
          customer.id !== editingId
      )
    ) {
      alert("A customer with this email already exists.");
      return;
    }

    if (editingId !== null) {
      setCustomers((current) =>
        current.map((customer) =>
          customer.id === editingId
            ? { ...customer, ...customerData }
            : customer
        )
      );
    } else {
      setCustomers((current) => [
        ...current,
        {
          id: Math.max(0, ...current.map((customer) => customer.id)) + 1,
          ...customerData,
        },
      ]);
    }

    resetForm();
  }

  function editCustomer(customer: Customer) {
    setEditingId(customer.id);
    setName(customer.name);
    setEmail(customer.email);
    setPhone(customer.phone);
    setAddress(customer.address);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteCustomer(id: number) {
    if (!window.confirm("Are you sure you want to delete this customer?")) {
      return;
    }

    setCustomers((current) =>
      current.filter((customer) => customer.id !== id)
    );

    if (editingId === id) {
      resetForm();
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-8 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-7xl">
        <a href="/" className="font-semibold text-blue-700 hover:underline">
          ← Back to Dashboard
        </a>

        <header className="mt-6">
          <h1 className="text-3xl font-bold">Customer Management</h1>
          <p className="mt-2 text-slate-600">
            Add, search, edit and delete customer records.
          </p>
        </header>

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            {editingId === null ? "Add New Customer" : "Edit Customer"}
          </h2>

          <form
            onSubmit={saveCustomer}
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
            <label className="text-sm font-medium">
              Full Name *
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter full name"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              />
            </label>

            <label className="text-sm font-medium">
              Email *
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="customer@example.com"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              />
            </label>

            <label className="text-sm font-medium">
              Phone
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Phone number"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              />
            </label>

            <label className="text-sm font-medium">
              Address
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="City or address"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              />
            </label>

            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800"
              >
                {editingId === null ? "Add Customer" : "Save Changes"}
              </button>

              {editingId !== null && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg border border-slate-300 px-5 py-2.5 hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">
              Customers ({filteredCustomers.length})
            </h2>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, phone or address..."
              aria-label="Search customers"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 sm:max-w-md"
            />
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Address</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="border-t border-slate-100">
                    <td className="p-3">{customer.id}</td>
                    <td className="p-3 font-medium">{customer.name}</td>
                    <td className="p-3">{customer.email}</td>
                    <td className="p-3">{customer.phone || "—"}</td>
                    <td className="p-3">{customer.address || "—"}</td>
                    <td className="p-3">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => editCustomer(customer)}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCustomer(customer.id)}
                          className="font-semibold text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredCustomers.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="p-8 text-center text-slate-500"
                    >
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-4 text-sm text-slate-500">
          Frontend prototype using sample data. Changes are temporary and are
          not saved to PostgreSQL yet.
        </p>
      </div>
    </main>
  );
}
