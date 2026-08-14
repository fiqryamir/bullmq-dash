import type { AppQueue, RedisStats } from '../api/contract';
import { QueueNav, type QueueViewName } from './QueueNav';
import { useRedisStats } from './useRedisStats';

type QueueRedisProps = {
  queue: AppQueue;
  onBack: () => void;
  onSelectView: (view: QueueViewName) => void;
  showMetrics: boolean;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '-';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '-';
  }
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function Stat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="redis-stat">
      <dt className="redis-stat__label">{label}</dt>
      <dd className={`redis-stat__value${mono ? ' redis-stat__value--mono' : ''}`}>{value}</dd>
    </div>
  );
}

function MemoryStat({ stats }: { stats: RedisStats }) {
  return (
    <dl className="redis-stats__group">
      <Stat label="Memory used" value={formatBytes(stats.memory.used)} />
      <Stat label="Memory limit" value={formatBytes(stats.memory.total)} />
      <Stat label="Peak" value={formatBytes(stats.memory.peak)} />
      <Stat
        label="Fragmentation ratio"
        value={stats.memory.fragmentationRatio ? stats.memory.fragmentationRatio.toFixed(2) : '-'}
      />
    </dl>
  );
}

export function QueueRedis({ queue, onBack, onSelectView, showMetrics }: QueueRedisProps) {
  const { stats, status, refresh } = useRedisStats();

  return (
    <section className="queue-redis" aria-label="Redis stats">
      <header className="queue-jobs__header">
        <button
          type="button"
          className="queue-jobs__back"
          onClick={onBack}
          aria-label="Back to jobs"
        >
          ← Back
        </button>
        <h1 className="queue-jobs__title">{queue.name}</h1>
        <span className="queue-flow__subtitle">Redis</span>
        <button
          type="button"
          className="action-btn queue-jobs__view-action"
          onClick={refresh}
          aria-label="Refresh Redis stats"
        >
          Refresh
        </button>
      </header>

      <QueueNav queue={queue} active="redis" onSelect={onSelectView} showMetrics={showMetrics} />

      {status === 'loading' ? (
        <p className="queues-status">Loading Redis stats…</p>
      ) : status === 'error' ? (
        <p className="queues-status queues-status--error" role="alert">
          Failed to load Redis stats
        </p>
      ) : !stats ? (
        <p className="queues-status">Redis stats unavailable</p>
      ) : (
        <div className="redis-stats" aria-label="Redis stats of the backing store">
          <dl className="redis-stats__group">
            <Stat label="Version" value={stats.version} mono />
            <Stat label="Mode" value={stats.mode ?? '-'} />
            <Stat label="Port" value={stats.port ? String(stats.port) : '-'} mono />
            <Stat label="OS" value={stats.os ?? '-'} />
            <Stat label="Uptime" value={stats.uptime ? formatUptime(stats.uptime) : '-'} />
          </dl>
          <MemoryStat stats={stats} />
          <dl className="redis-stats__group">
            <Stat label="Connected clients" value={String(stats.clients.connected)} />
            <Stat label="Blocked clients" value={String(stats.clients.blocked)} />
          </dl>
        </div>
      )}
    </section>
  );
}
