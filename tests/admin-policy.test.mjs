import test from "node:test";
import assert from "node:assert/strict";
import { adminAccessDenial, adminAccessStatus } from "../src/lib/admin-policy.ts";

test("Staff is forbidden from Admin-only actions", async () => {
  assert.equal(adminAccessStatus("STAFF"), 403);
  const response = adminAccessDenial("STAFF");
  assert.equal(response?.status, 403);
  assert.deepEqual(await response?.json(), { success: false, message: "Administrator access required" });
});

test("Unauthenticated users must sign in", () => {
  assert.equal(adminAccessStatus(null), 401);
  assert.equal(adminAccessDenial(null)?.status, 401);
});

test("Administrators pass the role gate", () => {
  assert.equal(adminAccessStatus("ADMIN"), 200);
  assert.equal(adminAccessDenial("ADMIN"), null);
});
