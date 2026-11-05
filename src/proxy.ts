import { NextRequest, NextResponse } from "next/server";
import { getAccountForSession, sameOrigin, SESSION_COOKIE } from "@/lib/auth";
import { adminAccessDenial, adminAccessStatus } from "@/lib/admin-policy";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === "/login" || path.startsWith("/api/auth/") || path === "/api/expire-reservations") {
    return NextResponse.next();
  }

  const api = path.startsWith("/api/");
  const adminOnly = path === "/admin/users" || path.startsWith("/admin/users/") || path.startsWith("/api/admin/");
  try {
    const account = await getAccountForSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!account) {
      if (api) return NextResponse.json({ success: false, message: "Sign in required" }, { status: 401 });
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (adminOnly && adminAccessStatus(account.role) === 403) {
      if (api) return adminAccessDenial(account.role)!;
      return new NextResponse("Administrator access required", { status: 403 });
    }
  } catch {
    if (api) return NextResponse.json({ success: false, message: "Authentication is temporarily unavailable" }, { status: 503 });
    return new NextResponse("Authentication is temporarily unavailable", { status: 503 });
  }

  if (api && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request)) {
    return NextResponse.json({ success: false, message: "Request origin is not allowed" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next|.*\\..*).*)"] };
