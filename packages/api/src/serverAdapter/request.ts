import type { BullBoardQueues, BullBoardRequest, UIConfig } from '../typings/app';

/**
 * The framework-request surface a server adapter hands to the core — every
 * framework's request object offers these four, in its own typing.
 */
export type RawServerRequest = {
  query: unknown;
  params: unknown;
  body: unknown;
  headers: unknown;
};

/**
 * Assembles the `BullBoardRequest` the core handlers consume from a raw
 * framework request. Server adapters share this assembly so the request
 * contract cannot drift between frameworks.
 */
export function buildBullBoardRequest(
  queues: BullBoardQueues,
  uiConfig: UIConfig,
  raw: RawServerRequest
): BullBoardRequest {
  return {
    queues,
    uiConfig,
    query: raw.query as Record<string, unknown>,
    params: raw.params as Record<string, unknown>,
    body: (raw.body ?? {}) as Record<string, unknown>,
    headers: raw.headers as Record<string, string | undefined>,
  };
}
