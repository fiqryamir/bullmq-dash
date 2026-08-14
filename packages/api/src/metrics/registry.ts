import type { BullBoardQueues } from '../typings/app';
import type { MetricsStore } from './store';

/**
 * The metrics store of the board that owns a queues map. Keyed on the map
 * instance the server adapters hand every request, so handlers resolve the
 * store without the server-adapter interface growing a metrics slot.
 */
const stores = new WeakMap<BullBoardQueues, MetricsStore>();

export function registerMetricsStore(queues: BullBoardQueues, store: MetricsStore): void {
  stores.set(queues, store);
}

export function getMetricsStore(queues: BullBoardQueues): MetricsStore | null {
  return stores.get(queues) ?? null;
}
