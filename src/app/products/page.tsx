import type { Metadata } from "next";
import CatalogManager from "@/components/catalog/catalog-manager";
export const metadata: Metadata = { title: "Products | OmniLock" };
export default function Page() { return <CatalogManager key="products" kind="products" />; }
