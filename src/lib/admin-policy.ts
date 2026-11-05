export type AppRole = "ADMIN" | "STAFF";

export function adminAccessStatus(role: AppRole | null): 200 | 401 | 403 {
  if (role === null) return 401;
  return role === "ADMIN" ? 200 : 403;
}

export function adminAccessDenial(role: AppRole | null): Response | null {
  const status = adminAccessStatus(role);
  if (status === 200) return null;
  return Response.json({ success: false, message: status === 403 ? "Administrator access required" : "Sign in required" }, { status });
}
