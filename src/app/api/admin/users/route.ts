import { NextRequest, NextResponse } from "next/server";
import { getAccountForSession, SESSION_COOKIE } from "@/lib/auth";
import { adminAccessDenial } from "@/lib/admin-policy";
import { sql } from "@/lib/neon-http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const account = await getAccountForSession(request.cookies.get(SESSION_COOKIE)?.value);
    const denial = adminAccessDenial(account?.role ?? null);
    if (denial) return denial;

    const params = request.nextUrl.searchParams;
    const search = (params.get("search") ?? "").trim();
    const role = params.get("role") ?? "";
    const pageText = params.get("page") ?? "1";
    if (search.length > 100 || !/^[1-9]\d{0,5}$/.test(pageText) || !["", "ADMIN", "STAFF"].includes(role)) {
      return NextResponse.json({ success: false, message: "Invalid search, role, or page" }, { status: 400 });
    }
    const page = Number(pageText);
    const pageSize = 20;
    const offset = (page - 1) * pageSize;
    const [countRows, rows, readiness] = await Promise.all([
      sql`SELECT count(*)::integer AS total FROM public.omnilock_account
          WHERE (${role} = '' OR role = ${role}) AND
            (${search} = '' OR strpos(lower(full_name), lower(${search})) > 0 OR strpos(lower(email), lower(${search})) > 0)`,
      sql`SELECT a.account_id, a.full_name, a.email, a.phone, a.role, a.created_at,
            COALESCE((to_jsonb(a)->>'is_active')::boolean, true) AS is_active
          FROM public.omnilock_account a
          WHERE (${role} = '' OR a.role = ${role}) AND
            (${search} = '' OR strpos(lower(a.full_name), lower(${search})) > 0 OR strpos(lower(a.email), lower(${search})) > 0)
          ORDER BY a.account_id LIMIT ${pageSize} OFFSET ${offset}`,
      sql`SELECT to_regprocedure('public.omnilock_set_account_role(bigint,bigint,character varying)') IS NOT NULL
             AND to_regprocedure('public.omnilock_set_account_active(bigint,bigint,boolean)') IS NOT NULL
             AND to_regclass('public.omnilock_admin_audit') IS NOT NULL AS ready`,
    ]);
    const response = NextResponse.json({
      success: true,
      users: rows.map((row) => ({
        id: Number(row.account_id), name: row.full_name, email: row.email,
        phone: row.phone, role: row.role, isActive: row.is_active, createdAt: row.created_at,
      })),
      total: Number(countRows[0]?.total ?? 0), page, pageSize,
      managementReady: readiness[0]?.ready === true,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json({ success: false, message: "User management is temporarily unavailable" }, { status: 503 });
  }
}
