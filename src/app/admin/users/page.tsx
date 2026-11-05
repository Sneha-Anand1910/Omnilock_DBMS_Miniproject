import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getAccountForSession, SESSION_COOKIE } from "@/lib/auth";
import UsersView from "./users-view";

export const metadata: Metadata = { title: "User Management | OmniLock" };

export default async function Page() {
  const account = await getAccountForSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!account) redirect("/login");
  if (account.role !== "ADMIN") notFound();
  return <UsersView currentUserId={account.id} />;
}
