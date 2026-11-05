// Optional live check after applying the Admin migration. Supply an existing
// Staff session token through the environment; this script never prints it.
import test from "node:test";
import assert from "node:assert/strict";

const token = process.env.OMNILOCK_TEST_STAFF_SESSION;
const base = process.env.OMNILOCK_TEST_BASE_URL || "http://localhost:3000";

test("Staff gets HTTP 403 from Admin page and APIs", { skip: !token }, async () => {
  for (const [path, method, body] of [
    ["/admin/users", "GET", null],
    ["/api/admin/users", "GET", null],
    ["/api/admin/users/1", "PATCH", { role: "ADMIN" }],
    ["/api/admin/users/1", "PATCH", { isActive: false }],
  ]) {
    const response = await fetch(new URL(path, base), {
      method,
      headers: {
        Cookie: `omnilock_session=${token}`,
        ...(method === "PATCH" ? { Origin: base, "Content-Type": "application/json" } : {}),
      },
      ...(method === "PATCH" ? { body: JSON.stringify(body) } : {}),
      redirect: "manual",
    });
    assert.equal(response.status, 403, `${method} ${path}`);
  }
});
