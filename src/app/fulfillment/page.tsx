import type { Metadata } from "next";
import PreparationManager from "@/components/preparation/preparation-manager";
export const metadata: Metadata = { title: "Fulfillment | OmniLock" };
export default function Page() { return <PreparationManager key="fulfillment" kind="fulfillment" />; }
