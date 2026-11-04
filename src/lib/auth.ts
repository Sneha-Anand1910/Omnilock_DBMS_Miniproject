import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { sql } from "@/lib/neon-http";

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = "omnilock_session";
export const SESSION_AGE_SECONDS = 60 * 60 * 24 * 7;

export type Account = { id: number; name: string; email: string; phone: string | null; role: "STAFF" | "ADMIN" };

export function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !!origin && origin === new URL(request.url).origin;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [algorithm, salt, hex] = stored.split("$");
  if (algorithm !== "scrypt" || !/^[a-f0-9]{32}$/.test(salt ?? "") || !/^[a-f0-9]{128}$/.test(hex ?? "")) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(hex, "hex"));
}

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(accountId: number) {
  const token = randomBytes(32).toString("base64url");
  await sql`
    INSERT INTO public.omnilock_session (token_hash, account_id, expires_at)
    VALUES (${tokenHash(token)}, ${accountId}, now() + interval '7 days')
  `;
  return token;
}

export async function getAccountForSession(token: string | undefined): Promise<Account | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const rows = await sql`
    SELECT a.account_id, a.full_name, a.email, a.phone, a.role
    FROM public.omnilock_session s
    JOIN public.omnilock_account a ON a.account_id = s.account_id
    WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > now()
    LIMIT 1
  `;
  if (!rows.length) return null;
  return {
    id: Number(rows[0].account_id),
    name: String(rows[0].full_name),
    email: String(rows[0].email),
    phone: rows[0].phone === null ? null : String(rows[0].phone),
    role: rows[0].role === "ADMIN" ? "ADMIN" : "STAFF",
  };
}
