import type { Metadata } from "next";
import DirectoryManager from "@/components/directory/directory-manager";
export const metadata: Metadata = { title: "Categories | OmniLock" };
export default function Page() { return <DirectoryManager kind="categories" />; }
