
"use client";

import { useState } from "react";

type Category = {
  id: number;
  name: string;
  description: string;
};

const initialCategories: Category[] = [
  {
    id: 1,
    name: "Electronics",
    description: "Electronic devices and accessories",
  },
  {
    id: 2,
    name: "Clothing",
    description: "Clothes and fashion accessories",
  },
  {
    id: 3,
    name: "Home Appliances",
    description: "Appliances and equipment for the home",
  },
];

export default function CategoriesPage() {
  const [categories, setCategories] =
    useState<Category[]>(initialCategories);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const filteredCategories = categories.filter((category) =>
    `${category.name} ${category.description}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  function resetForm() {
    setName("");
    setDescription("");
    setEditingId(null);
  }

  function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();

    const duplicate = categories.some(
      (category) =>
        category.name.toLowerCase() === trimmedName.toLowerCase() &&
        category.id !== editingId
    );

    if (duplicate) {
      alert("A category with this name already exists.");
      return;
    }

    if (editingId !== null) {
      setCategories((current) =>
        current.map((category) =>
          category.id === editingId
            ? {
                ...category,
                name: trimmedName,
                description: trimmedDescription,
              }
            : category
        )
      );
    } else {
      setCategories((current) => [
        ...current,
        {
          id: Math.max(0, ...current.map((category) => category.id)) + 1,
          name: trimmedName,
          description: trimmedDescription,
        },
      ]);
    }

    resetForm();
  }

  function editCategory(category: Category) {
    setEditingId(category.id);
    setName(category.name);
    setDescription(category.description);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteCategory(id: number) {
    if (!window.confirm("Are you sure you want to delete this category?")) {
      return;
    }

    setCategories((current) =>
      current.filter((category) => category.id !== id)
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
          <h1 className="text-3xl font-bold">Category Management</h1>
          <p className="mt-2 text-slate-600">
            Create, search, edit and delete product categories.
          </p>
        </header>

        <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">
            {editingId === null ? "Add New Category" : "Edit Category"}
          </h2>

          <form
            onSubmit={saveCategory}
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
            <label className="text-sm font-medium">
              Category Name *
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Electronics"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              />
            </label>

            <label className="text-sm font-medium">
              Description
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe this category"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
              />
            </label>

            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800"
              >
                {editingId === null ? "Add Category" : "Save Changes"}
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
              Categories ({filteredCategories.length})
            </h2>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search categories..."
              aria-label="Search categories"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 sm:max-w-md"
            />
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">Category Name</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredCategories.map((category) => (
                  <tr key={category.id} className="border-t border-slate-100">
                    <td className="p-3">{category.id}</td>
                    <td className="p-3 font-medium">{category.name}</td>
                    <td className="p-3">{category.description || "—"}</td>
                    <td className="p-3">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => editCategory(category)}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(category.id)}
                          className="font-semibold text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredCategories.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-8 text-center text-slate-500"
                    >
                      No categories found.
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
