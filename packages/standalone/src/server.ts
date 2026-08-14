import { BullMQAdapter, createBullBoard } from '@bullmq-dash/api';
import { ExpressAdapter } from '@bullmq-dash/express';
import { Queue, type QueueOptions } from 'bullmq';
import type { Server } from 'node:http';
import Redis from 'ioredis';
import type { StandaloneConfig } from './config';
import { discoverQueueNames } from './discoverQueues';

export type StandaloneServerHandle = {
  server: Server;
  /** The URL the server is listening on - resolves ephemeral ports. */
  url: string;
  close(): Promise<void>;
};

export function redisConnectionOptions(config: StandaloneConfig['redis']): QueueOptions['connection'] {
  return {
    host: config.host,
    port: config.port,
    db: config.db,
    ...(config.password !== undefined ? { password: config.password } : {}),
  };
}

/**
 * Boots the standalone dashboard server: discovers the queues on the Redis
 * connection (an allow-list shows exactly the listed queues, even ones with
 * no keys yet - a fresh queue must be visible), registers each with the
 * board, and starts listening. Fails fast with the underlying Redis error
 * when the connection is unreachable.
 */
export async function startStandaloneServer(
  config: StandaloneConfig
): Promise<StandaloneServerHandle> {
  const connection = redisConnectionOptions(config.redis);

  const discoveryClient = new Redis({
    ...connection,
    retryStrategy: () => null,
    maxRetriesPerRequest: 1,
  });
  await discoveryClient.ping();

  const discovered = await discoverQueueNames(discoveryClient, config.redis.prefix);
  const names = config.queues ? [...config.queues].sort() : discovered;
  const queues = names.map(
    (name) => new Queue(name, { connection, prefix: config.redis.prefix })
  );

  const serverAdapter = new ExpressAdapter();
  createBullBoard({
    queues: queues.map((queue) => new BullMQAdapter(queue)),
    serverAdapter,
  });

  const server = serverAdapter.getRouter().listen(config.port, config.host);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : config.port;
  const url = `http://${config.host}:${boundPort}`;

  const close = async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections?.();
    });
    await Promise.all(queues.map((queue) => queue.close()));
    await discoveryClient.quit();
  };

  return { server, url, close };
}
