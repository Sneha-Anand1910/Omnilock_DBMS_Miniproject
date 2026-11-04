// Run reservation expiry only in the local Node.js development server.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "development") {
    return;
  }

  const globalScheduler = globalThis as typeof globalThis & {
    __omnilockExpiryTimer?: ReturnType<typeof setInterval>;
  };
  if (globalScheduler.__omnilockExpiryTimer) return;

  const { sql } = await import("./lib/neon-http");
  let running = false;

  globalScheduler.__omnilockExpiryTimer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await sql`SELECT expire_reservations() AS expired_count`;
    } catch {
      // Do not log database errors that could contain connection details.
      console.error("Automatic reservation expiry failed.");
    } finally {
      running = false;
    }
  }, 60_000);
}
