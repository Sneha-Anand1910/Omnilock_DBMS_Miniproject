import { NextRequest, NextResponse } from "next/server";
import { getAccountForSession, sameOrigin, SESSION_COOKIE } from "@/lib/auth";
import { adminAccessDenial } from "@/lib/admin-policy";
import { sql } from "@/lib/neon-http";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const account = await getAccountForSession(request.cookies.get(SESSION_COOKIE)?.value);
    const denial = adminAccessDenial(account?.role ?? null);
    if (denial) return denial;
    if (!sameOrigin(request)) return NextResponse.json({ success: false, message: "Request origin is not allowed" }, { status: 403 });

    const { id } = await context.params;
    const targetId = Number(id);
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(targetId)) {
      return NextResponse.json({ success: false, message: "Invalid account ID" }, { status: 400 });
    }
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1) {
      return NextResponse.json({ success: false, message: "Select a valid role or account status" }, { status: 400 });
    }
    if (targetId === account!.id) return NextResponse.json({ success: false, message: "You cannot change your own role or status" }, { status: 409 });
    const input = body as Record<string, unknown>;
    let rows;
    if ("role" in input && (input.role === "ADMIN" || input.role === "STAFF")) {
      rows = await sql`SELECT public.omnilock_set_account_role(${account!.id}::bigint, ${targetId}::bigint, ${input.role}::varchar) AS user`;
    } else if ("isActive" in input && typeof input.isActive === "boolean") {
      rows = await sql`SELECT public.omnilock_set_account_active(${account!.id}::bigint, ${targetId}::bigint, ${input.isActive}::boolean) AS user`;
    } else {
      return NextResponse.json({ success: false, message: "Select a valid role or account status" }, { status: 400 });
    }
    const response = NextResponse.json({ success: true, user: rows[0].user });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code === "42501") return NextResponse.json({ success: false, message: "Administrator access required" }, { status: 403 });
    if (code === "P0002") return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });
    if (code === "P4092") return NextResponse.json({ success: false, message: "Cannot remove the last active administrator" }, { status: 409 });
    if (code === "P4091") return NextResponse.json({ success: false, message: "You cannot change your own role or status" }, { status: 409 });
    if (code === "P4090") return NextResponse.json({ success: false, message: "Account changed. Refresh before retrying." }, { status: 409 });
    if (code === "22023") return NextResponse.json({ success: false, message: "Invalid role" }, { status: 400 });
    if (code === "42883" || code === "42P01" || code === "42703") return NextResponse.json({ success: false, message: "Apply the admin role-management migration in Neon before changing accounts" }, { status: 503 });
    return NextResponse.json({ success: false, message: "Role change is temporarily unavailable" }, { status: 503 });
  }
}
