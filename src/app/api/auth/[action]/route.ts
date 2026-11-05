import { NextRequest, NextResponse } from "next/server";
import { createSession, getAccountForSession, hashPassword, normalizedEmail, sameOrigin, SESSION_AGE_SECONDS, SESSION_COOKIE, tokenHash, verifyPassword } from "@/lib/auth";
import { sql } from "@/lib/neon-http";
import { passwordError } from "@/lib/password-policy";

export const runtime = "nodejs";

type Context = { params: Promise<{ action: string }> };

function failure(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function setSession(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_AGE_SECONDS,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest, context: Context) {
  const { action } = await context.params;
  if (action !== "me") return failure("Not found", 404);
  try {
    const account = await getAccountForSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!account) return failure("Not signed in", 401);
    const response = NextResponse.json({ success: true, user: account });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return failure("Authentication is temporarily unavailable", 503);
  }
}

export async function POST(request: NextRequest, context: Context) {
  const { action } = await context.params;
  if (!["register", "login", "logout"].includes(action)) return failure("Not found", 404);
  if (!sameOrigin(request)) return failure("Request origin is not allowed", 403);

  if (action === "logout") {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    try {
      if (token) await sql`DELETE FROM public.omnilock_session WHERE token_hash = ${tokenHash(token)}`;
    } catch {
      return failure("Could not sign out. Please retry.", 503);
    }
    const response = NextResponse.json({ success: true });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  let body: unknown;
  try { body = await request.json(); }
  catch { return failure("Enter valid account details", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return failure("Enter valid account details", 400);
  const values = body as Record<string, unknown>;
  const email = typeof values.email === "string" ? normalizedEmail(values.email) : "";
  const password = values.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return failure("Enter a valid email address", 400);
  if (typeof password !== "string" || !password || password.length > 128) return failure("Enter a valid password", 400);

  if (action === "register") {
    const name = typeof values.name === "string" ? values.name.trim() : "";
    const phone = typeof values.phone === "string" ? values.phone.trim() : "";
    if ("role" in values || "isActive" in values || "is_active" in values) return failure("Account role or status cannot be selected during registration", 400);
    const ruleError = passwordError(password);
    if (ruleError) return failure(ruleError, 400);
    if (values.confirmPassword !== password) return failure("Passwords do not match", 400);
    if (!name || name.length > 100 || phone.length > 20 || (phone && !/^[+\d()\s-]+$/.test(phone))) {
      return failure("Enter a name up to 100 characters and a valid optional phone number", 400);
    }
    try {
      const passwordHash = await hashPassword(password);
      const rows = await sql`
        INSERT INTO public.omnilock_account (full_name, email, password_hash, phone, role)
        VALUES (${name}, ${email}, ${passwordHash}, ${phone || null}, 'STAFF')
        RETURNING account_id, role
      `;
      const accountId = Number(rows[0].account_id);
      const token = await createSession(accountId);
      return setSession(NextResponse.json({ success: true, user: { id: accountId, name, email, phone: phone || null, role: "STAFF" } }, { status: 201 }), token);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") return failure("An account with this email already exists", 409);
      return failure("Account creation is temporarily unavailable", 503);
    }
  }

  try {
    const rows = await sql`
      SELECT account_id, full_name, email, phone, role, password_hash, locked_until,
        COALESCE((to_jsonb(a)->>'is_active')::boolean, true) AS is_active
      FROM public.omnilock_account a WHERE lower(email) = ${email} LIMIT 1
    `;
    if (!rows.length) return failure("Invalid email or password", 401);
    const row = rows[0];
    if (row.locked_until && new Date(String(row.locked_until)).getTime() > Date.now()) {
      return failure("Too many attempts. Try again in 15 minutes.", 429);
    }
    if (!(await verifyPassword(password, String(row.password_hash)))) {
      await sql`
        UPDATE public.omnilock_account
        SET failed_logins = failed_logins + 1,
            locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END
        WHERE account_id = ${row.account_id}
      `;
      return failure("Invalid email or password", 401);
    }
    if (!row.is_active) return failure("This account is disabled. Contact an administrator.", 403);
    await sql`UPDATE public.omnilock_account SET failed_logins = 0, locked_until = NULL WHERE account_id = ${row.account_id}`;
    const token = await createSession(Number(row.account_id));
    return setSession(NextResponse.json({ success: true, user: { id: Number(row.account_id), name: row.full_name, email: row.email, phone: row.phone, role: row.role } }), token);
  } catch {
    return failure("Sign in is temporarily unavailable", 503);
  }
}
