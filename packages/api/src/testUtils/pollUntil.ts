/**
 * Polls `predicate` every 50ms until it resolves true or the deadline passes.
 * Used by the integration specs to wait for async worker effects on real
 * Redis (a job reaching a state, a count changing).
 */
export async function pollUntil(
  predicate: () => Promise<boolean>,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`condition not met within ${timeoutMs}ms`);
}
