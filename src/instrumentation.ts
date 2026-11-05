// Run expiry while a persistent Node.js application process is alive.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const globalScheduler = globalThis as typeof globalThis & {
    __omnilockExpiryTimer?: ReturnType<typeof setInterval>;
  };
  if (globalScheduler.__omnilockExpiryTimer) return;

  const { expireHolds } = await import("./lib/expire-holds");
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await expireHolds();
    } catch {
      // Do not log database errors that could contain connection details.
      console.error("Automatic reservation expiry failed.");
    } finally {
      running = false;
    }
  };
  globalScheduler.__omnilockExpiryTimer = setInterval(run, 60_000);
  void run();
}
