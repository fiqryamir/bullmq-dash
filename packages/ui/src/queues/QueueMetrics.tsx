import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { AppQueue } from '../api/contract';
import { useTheme } from '../theme/ThemeProvider';
import { aggregateBuckets } from './metricsDownsample';
import { QueueNav, type QueueViewName } from './QueueNav';
import { useQueueMetrics, type MetricsRange } from './useQueueMetrics';

const HOUR_MS = 60 * 60 * 1000;

type TokenColors = {
  completed: string;
  failed: string;
  duration: string;
  wait: string;
  surface: string;
  grid: string;
  muted: string;
  text: string;
};

/**
 * The chart palette, read from the design tokens. Recharts draws SVG
 * attributes, which cannot resolve CSS custom properties, so the token
 * values are resolved here and re-read whenever the theme flips.
 */
function useTokenColors(): TokenColors {
  const { theme } = useTheme();
  return useMemo(() => {
    const style = getComputedStyle(document.documentElement);
    const token = (name: string) => style.getPropertyValue(name).trim() || '#888888';
    return {
      completed: token('--dash-state-completed'),
      failed: token('--dash-state-failed'),
      duration: token('--dash-state-active'),
      wait: token('--dash-state-waiting'),
      surface: token('--dash-surface'),
      grid: token('--dash-border'),
      muted: token('--dash-muted'),
      text: token('--dash-text'),
    };
  }, [theme]);
}

export function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

function formatTick(ts: number, range: MetricsRange): string {
  const date = new Date(ts);
  if (range === '7d') {
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' });
  }
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

type QueueMetricsProps = {
  queue: AppQueue;
  onBack: () => void;
  onSelectView: (view: QueueViewName) => void;
  showMetrics: boolean;
};

const RANGES: MetricsRange[] = ['24h', '7d'];

export function QueueMetrics({ queue, onBack, onSelectView, showMetrics }: QueueMetricsProps) {
  const { t } = useTranslation();
  const [range, setRange] = useState<MetricsRange>('24h');
  const { buckets, status, refresh } = useQueueMetrics(queue.name, range);
  const tokens = useTokenColors();

  // Minute buckets for the day view; hourly aggregation for the week view so
  // the chart stays readable without 10k points.
  const chartData = useMemo(
    () => (range === '7d' ? aggregateBuckets(buckets, HOUR_MS) : buckets),
    [buckets, range]
  );

  const summary = useMemo(() => {
    let completed = 0;
    let failed = 0;
    const duration: number[] = [];
    const wait: number[] = [];
    for (const bucket of chartData) {
      completed += bucket.completed;
      failed += bucket.failed;
      if (bucket.durationAvgMs !== null) {
        duration.push(bucket.durationAvgMs);
      }
      if (bucket.waitAvgMs !== null) {
        wait.push(bucket.waitAvgMs);
      }
    }
    const average = (samples: number[]) =>
      samples.length === 0 ? null : samples.reduce((sum, value) => sum + value, 0) / samples.length;
    const avgDuration = average(duration);
    const avgWait = average(wait);
    return {
      completed,
      failed,
      avgDuration,
      avgWait,
      hasActivity: completed + failed > 0,
    };
  }, [chartData]);

  const hasActivity = summary.hasActivity;
  const rangeLabel = range === '24h' ? t('METRICS.RANGE_24H') : t('METRICS.RANGE_7D');

  const tooltipStyle = {
    background: tokens.surface,
    border: `1px solid ${tokens.grid}`,
    borderRadius: 8,
    color: tokens.text,
    fontSize: 12,
  };

  return (
    <section className="queue-metrics" aria-label={t('METRICS.VIEW_ARIA', { queue: queue.name })}>
      <header className="queue-jobs__header">
        <button type="button" className="queue-jobs__back" onClick={onBack}>
          {t('COMMON.BACK')}
        </button>
        <h1 className="queue-jobs__title">{queue.name}</h1>
        <span className="queue-flow__subtitle">{t('NAV.METRICS')}</span>
      </header>

      <QueueNav queue={queue} active="metrics" onSelect={onSelectView} showMetrics={showMetrics} />

      <div className="queue-metrics__controls">
        <div className="metrics-range" role="group" aria-label={t('METRICS.RANGE_ARIA')}>
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              className={`metrics-range__button${option === range ? ' metrics-range__button--selected' : ''}`}
              aria-pressed={option === range}
              onClick={() => setRange(option)}
            >
              {option === '24h' ? t('METRICS.RANGE_24H') : t('METRICS.RANGE_7D')}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="action-btn"
          onClick={refresh}
          aria-label={t('METRICS.REFRESH_ARIA')}
        >
          {t('COMMON.REFRESH')}
        </button>
      </div>

      {status === 'loading' ? (
        <p className="queues-status">{t('METRICS.LOADING')}</p>
      ) : status === 'error' ? (
        <p className="queues-status queues-status--error" role="alert">
          {t('METRICS.LOAD_FAILED')}
        </p>
      ) : (
        <>
          {!hasActivity ? (
            <p className="queues-status">{t('METRICS.NO_ACTIVITY')}</p>
          ) : (
            <p className="metrics-summary" id="metrics-summary">
              {t('METRICS.SUMMARY', { completed: summary.completed, failed: summary.failed, range: rangeLabel })}
              {summary.avgDuration !== null && (
                <>
                  {' · '}
                  {t('METRICS.AVG_DURATION', {
                    duration: formatMs(Math.round(summary.avgDuration)),
                  })}
                </>
              )}
              {summary.avgWait !== null && (
                <>
                  {' · '}
                  {t('METRICS.AVG_WAIT', { wait: formatMs(Math.round(summary.avgWait)) })}
                </>
              )}
            </p>
          )}

          <div className="metrics-charts">
            <div className="metrics-chart">
              <h2 className="metrics-chart__title">{t('METRICS.COUNTS')}</h2>
              <div
                className="metrics-chart__canvas"
                role="img"
                aria-label={t('METRICS.COUNTS_ARIA')}
              >
                <LineChart width={720} height={200} data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fill: tokens.muted, fontSize: 11 }}
                    tickFormatter={(ts: number) => formatTick(ts, range)}
                  />
                  <YAxis tick={{ fill: tokens.muted, fontSize: 11 }} allowDecimals={false} width={36} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(ts) => formatTick(Number(ts), range)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: tokens.muted }} />
                  <Line
                    type="monotone"
                    dataKey="completed"
                    name={t('METRICS.COMPLETED')}
                    stroke={tokens.completed}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="failed"
                    name={t('METRICS.FAILED')}
                    stroke={tokens.failed}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </div>
            </div>

            <div className="metrics-chart">
              <h2 className="metrics-chart__title">{t('METRICS.DURATION')}</h2>
              <div
                className="metrics-chart__canvas"
                role="img"
                aria-label={t('METRICS.DURATION_ARIA')}
              >
                <LineChart width={720} height={200} data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fill: tokens.muted, fontSize: 11 }}
                    tickFormatter={(ts: number) => formatTick(ts, range)}
                  />
                  <YAxis tick={{ fill: tokens.muted, fontSize: 11 }} width={44} tickFormatter={(value: number) => formatMs(value)} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(ts) => formatTick(Number(ts), range)}
                    formatter={(value) => [formatMs(Number(value)), t('METRICS.DURATION')]}
                  />
                  <Line
                    type="monotone"
                    dataKey="durationAvgMs"
                    name={t('METRICS.DURATION')}
                    stroke={tokens.duration}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </div>
            </div>

            <div className="metrics-chart">
              <h2 className="metrics-chart__title">{t('METRICS.WAIT_TIME')}</h2>
              <div
                className="metrics-chart__canvas"
                role="img"
                aria-label={t('METRICS.WAIT_ARIA')}
              >
                <LineChart width={720} height={200} data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    domain={['dataMin', 'dataMax']}
                    tick={{ fill: tokens.muted, fontSize: 11 }}
                    tickFormatter={(ts: number) => formatTick(ts, range)}
                  />
                  <YAxis tick={{ fill: tokens.muted, fontSize: 11 }} width={44} tickFormatter={(value: number) => formatMs(value)} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(ts) => formatTick(Number(ts), range)}
                    formatter={(value) => [formatMs(Number(value)), t('METRICS.WAIT')]}
                  />
                  <Line
                    type="monotone"
                    dataKey="waitAvgMs"
                    name={t('METRICS.WAIT')}
                    stroke={tokens.wait}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </div>
            </div>
          </div>

          <details className="metrics-table" role="group" aria-label={t('METRICS.TABLE_ARIA')}>
            <summary>{t('METRICS.DATA_TABLE')}</summary>
            <table>
              <caption className="visually-hidden">{t('METRICS.CAPTION', { queue: queue.name })}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('COMMON.TIME')}</th>
                  <th scope="col">{t('METRICS.COMPLETED')}</th>
                  <th scope="col">{t('METRICS.FAILED')}</th>
                  <th scope="col">{t('METRICS.DURATION')}</th>
                  <th scope="col">{t('METRICS.WAIT')}</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((b) => (
                  <tr key={b.ts}>
                    <td>{formatTick(b.ts, range)}</td>
                    <td>{b.completed}</td>
                    <td>{b.failed}</td>
                    <td>{b.durationAvgMs === null ? '—' : formatMs(b.durationAvgMs)}</td>
                    <td>{b.waitAvgMs === null ? '—' : formatMs(b.waitAvgMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </section>
  );
}
