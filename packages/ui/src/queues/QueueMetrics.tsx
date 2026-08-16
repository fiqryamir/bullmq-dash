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

  const tooltipStyle = {
    background: tokens.surface,
    border: `1px solid ${tokens.grid}`,
    borderRadius: 8,
    color: tokens.text,
    fontSize: 12,
  };

  return (
    <section className="queue-metrics" aria-label={`Metrics of ${queue.name}`}>
      <header className="queue-jobs__header">
        <button type="button" className="queue-jobs__back" onClick={onBack}>
          ← Back
        </button>
        <h1 className="queue-jobs__title">{queue.name}</h1>
        <span className="queue-flow__subtitle">Metrics</span>
      </header>

      <QueueNav queue={queue} active="metrics" onSelect={onSelectView} showMetrics={showMetrics} />

      <div className="queue-metrics__controls">
        <div className="metrics-range" role="group" aria-label="Metrics range">
          {RANGES.map((option) => (
            <button
              key={option}
              type="button"
              className={`metrics-range__button${option === range ? ' metrics-range__button--selected' : ''}`}
              aria-pressed={option === range}
              onClick={() => setRange(option)}
            >
              {option === '24h' ? '24 hours' : '7 days'}
            </button>
          ))}
        </div>
        <button type="button" className="action-btn" onClick={refresh} aria-label="Refresh metrics">
          Refresh
        </button>
      </div>

      {status === 'loading' ? (
        <p className="queues-status">Loading metrics…</p>
      ) : status === 'error' ? (
        <p className="queues-status queues-status--error" role="alert">
          Failed to load metrics
        </p>
      ) : (
        <>
          {!hasActivity ? (
            <p className="queues-status">No completed or failed jobs in this window</p>
          ) : (
            <p className="metrics-summary" id="metrics-summary">
              {summary.completed} completed, {summary.failed} failed in the last{' '}
              {range === '24h' ? '24h' : '7d'}
              {summary.avgDuration !== null && (
                <>
                  {' · '}
                  {formatMs(Math.round(summary.avgDuration))} average duration
                </>
              )}
              {summary.avgWait !== null && (
                <>
                  {' · '}
                  {formatMs(Math.round(summary.avgWait))} average wait
                </>
              )}
            </p>
          )}

          <div className="metrics-charts">
            <div className="metrics-chart">
              <h2 className="metrics-chart__title">Counts</h2>
              <div
                className="metrics-chart__canvas"
                role="img"
                aria-label="Counts of completed and failed jobs over time"
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
                    name="Completed"
                    stroke={tokens.completed}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="failed"
                    name="Failed"
                    stroke={tokens.failed}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </div>
            </div>

            <div className="metrics-chart">
              <h2 className="metrics-chart__title">Duration</h2>
              <div
                className="metrics-chart__canvas"
                role="img"
                aria-label="Average job duration over time"
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
                    formatter={(value) => [formatMs(Number(value)), 'Duration']}
                  />
                  <Line
                    type="monotone"
                    dataKey="durationAvgMs"
                    name="Duration"
                    stroke={tokens.duration}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </div>
            </div>

            <div className="metrics-chart">
              <h2 className="metrics-chart__title">Wait time</h2>
              <div
                className="metrics-chart__canvas"
                role="img"
                aria-label="Average wait time over time"
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
                    formatter={(value) => [formatMs(Number(value)), 'Wait']}
                  />
                  <Line
                    type="monotone"
                    dataKey="waitAvgMs"
                    name="Wait"
                    stroke={tokens.wait}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </div>
            </div>
          </div>

          <details className="metrics-table" role="group" aria-label="Metrics data table">
            <summary>Data table</summary>
            <table>
              <caption className="visually-hidden">Per-minute metrics for {queue.name}</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Completed</th>
                  <th scope="col">Failed</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Wait</th>
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

