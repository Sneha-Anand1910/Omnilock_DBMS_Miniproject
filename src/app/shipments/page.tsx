import type { Metadata } from "next";
import PreparationManager from "@/components/preparation/preparation-manager";
export const metadata: Metadata = { title: "Shipments | OmniLock" };
export default function Page() { return <PreparationManager key="shipments" kind="shipments" />; }
