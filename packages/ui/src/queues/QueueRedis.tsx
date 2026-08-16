import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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

function MemoryStat({ stats, t }: { stats: RedisStats; t: TFunction }) {
  return (
    <dl className="redis-stats__group">
      <Stat label={t('REDIS.MEMORY_USED')} value={formatBytes(stats.memory.used)} />
      <Stat label={t('REDIS.MEMORY_LIMIT')} value={formatBytes(stats.memory.total)} />
      <Stat label={t('REDIS.PEAK')} value={formatBytes(stats.memory.peak)} />
      <Stat
        label={t('REDIS.FRAGMENTATION_RATIO')}
        value={stats.memory.fragmentationRatio ? stats.memory.fragmentationRatio.toFixed(2) : '-'}
      />
    </dl>
  );
}

export function QueueRedis({ queue, onBack, onSelectView, showMetrics }: QueueRedisProps) {
  const { t } = useTranslation();
  const { stats, status, refresh } = useRedisStats();

  return (
    <section className="queue-redis" aria-label={t('REDIS.VIEW_ARIA')}>
      <header className="queue-jobs__header">
        <button
          type="button"
          className="queue-jobs__back"
          onClick={onBack}
          aria-label={t('COMMON.BACK_TO_JOBS')}
        >
          {t('COMMON.BACK')}
        </button>
        <h1 className="queue-jobs__title">{queue.name}</h1>
        <span className="queue-flow__subtitle">{t('NAV.REDIS')}</span>
        <button
          type="button"
          className="action-btn queue-jobs__view-action"
          onClick={refresh}
          aria-label={t('REDIS.REFRESH_ARIA')}
        >
          {t('COMMON.REFRESH')}
        </button>
      </header>

      <QueueNav queue={queue} active="redis" onSelect={onSelectView} showMetrics={showMetrics} />

      {status === 'loading' ? (
        <p className="queues-status">{t('REDIS.LOADING')}</p>
      ) : status === 'error' ? (
        <p className="queues-status queues-status--error" role="alert">
          {t('REDIS.LOAD_FAILED')}
        </p>
      ) : !stats ? (
        <p className="queues-status">{t('REDIS.UNAVAILABLE')}</p>
      ) : (
        <div className="redis-stats" aria-label={t('REDIS.BACKING_STORE_ARIA')}>
          <dl className="redis-stats__group">
            <Stat label={t('REDIS.VERSION')} value={stats.version} mono />
            <Stat label={t('REDIS.MODE')} value={stats.mode ?? '-'} />
            <Stat label={t('REDIS.PORT')} value={stats.port ? String(stats.port) : '-'} mono />
            <Stat label={t('REDIS.OS')} value={stats.os ?? '-'} />
            <Stat label={t('REDIS.UP_TIME')} value={stats.uptime ? formatUptime(stats.uptime) : '-'} />
          </dl>
          <MemoryStat stats={stats} t={t} />
          <dl className="redis-stats__group">
            <Stat label={t('REDIS.CONNECTED_CLIENTS')} value={String(stats.clients.connected)} />
            <Stat label={t('REDIS.BLOCKED_CLIENTS')} value={String(stats.clients.blocked)} />
          </dl>
        </div>
      )}
    </section>
  );
}
