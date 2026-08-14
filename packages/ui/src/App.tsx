import { useEffect, useMemo, useState } from 'react';
import { readUiConfig, type UIConfig } from './config';
import { CommandPalette } from './queues/CommandPalette';
import { JobDetail } from './queues/JobDetail';
import { QueueFlow } from './queues/QueueFlow';
import { QueueJobs } from './queues/QueueJobs';
import { QueueMetrics } from './queues/QueueMetrics';
import { QueueRedis } from './queues/QueueRedis';
import { QueueSchedulers } from './queues/QueueSchedulers';
import { QueueWorkers } from './queues/QueueWorkers';
import { QueuesList } from './queues/QueuesList';
import type { FlowNode } from './api/contract';
import type { QueueViewName } from './queues/QueueNav';
import { useQueues } from './queues/useQueues';
import { ThemeProvider } from './theme/ThemeProvider';
import { ThemeToggle } from './theme/ThemeToggle';
import './App.css';

const DEFAULT_POLLING_INTERVAL = 5000;

export function App({ uiConfig = readUiConfig() }: { uiConfig?: UIConfig }) {
  return (
    <ThemeProvider>
      <Dashboard uiConfig={uiConfig} />
    </ThemeProvider>
  );
}

function Dashboard({ uiConfig }: { uiConfig: UIConfig }) {
  const pollingInterval = uiConfig.pollingInterval?.forceInterval ?? DEFAULT_POLLING_INTERVAL;
  const { queues, status } = useQueues(pollingInterval);
  const [query, setQuery] = useState('');
  const [selectedQueueName, setSelectedQueueName] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [view, setView] = useState<QueueViewName>('jobs');
  const boardTitle = uiConfig.boardTitle ?? 'bullmq-dash';

  useEffect(() => {
    document.title = boardTitle;
  }, [boardTitle]);

  const visibleQueues = useMemo(
    () => queues.filter((queue) => queue.name.toLowerCase().includes(query.trim().toLowerCase())),
    [queues, query]
  );

  const selectedQueue = queues.find((queue) => queue.name === selectedQueueName);

  /**
   * Matches a node's raw BullMQ queue name against the registered queues.
   * Registered names carry the adapter's prefix, so the raw name either
   * equals the registered name or is that name with something in front of
   * it — the same simplification the flow endpoint performs server-side.
   */
  const registeredQueueFor = (node: FlowNode) =>
    queues.find((queue) => queue.name === node.queueName) ??
    queues.find((queue) => node.queueName.endsWith(`:${queue.name}`));

  const selectFlowNode = (node: FlowNode) => {
    const targetQueue = registeredQueueFor(node);
    if (!targetQueue) {
      return;
    }
    setSelectedQueueName(targetQueue.name);
    setSelectedJobId(node.id);
    setView('jobs');
  };

  const showMetrics = uiConfig.showMetrics !== false;

  const openQueue = (queueName: string) => {
    setSelectedQueueName(queueName);
    setSelectedJobId(null);
    setView('jobs');
  };

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__brand">{boardTitle}</span>
        <ThemeToggle />
      </header>
      <main className={selectedQueue ? 'app__main app__main--queue' : 'app__main'}>
        {selectedQueue ? (
          selectedJobId ? (
            <JobDetail
              queue={selectedQueue}
              jobId={selectedJobId}
              pollingInterval={pollingInterval}
              onBack={() => setSelectedJobId(null)}
              onSelectNode={selectFlowNode}
            />
          ) : view === 'flow' ? (
            <QueueFlow
              queue={selectedQueue}
              pollingInterval={pollingInterval}
              onBack={() => setView('jobs')}
              onSelectView={setView}
              showMetrics={showMetrics}
              onSelectNode={selectFlowNode}
            />
          ) : view === 'metrics' ? (
            <QueueMetrics
              queue={selectedQueue}
              onBack={() => setView('jobs')}
              onSelectView={setView}
              showMetrics={showMetrics}
            />
          ) : view === 'schedulers' ? (
            <QueueSchedulers
              queue={selectedQueue}
              onBack={() => setView('jobs')}
              onSelectView={setView}
              showMetrics={showMetrics}
            />
          ) : view === 'workers' ? (
            <QueueWorkers
              queue={selectedQueue}
              onBack={() => setView('jobs')}
              onSelectView={setView}
              showMetrics={showMetrics}
            />
          ) : view === 'redis' ? (
            <QueueRedis
              queue={selectedQueue}
              onBack={() => setView('jobs')}
              onSelectView={setView}
              showMetrics={showMetrics}
            />
          ) : (
            <QueueJobs
              queue={selectedQueue}
              pollingInterval={pollingInterval}
              onBack={() => setSelectedQueueName(null)}
              onSelectView={setView}
              showMetrics={showMetrics}
              onSelectJob={(job) => job.id && setSelectedJobId(job.id)}
            />
          )
        ) : (
          <>
            <input
              type="search"
              className="command-bar"
              placeholder="Search queues…"
              aria-label="Search queues"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <CommandPalette
              onSelectJob={(result) => {
                if (!result.job.id) {
                  return;
                }
                openQueue(result.queue);
                setSelectedJobId(result.job.id);
              }}
            />
            {status === 'loading' && queues.length === 0 ? (
              <p className="queues-status">Loading queues…</p>
            ) : status === 'error' && queues.length === 0 ? (
              <p className="queues-status queues-status--error">Failed to load queues</p>
            ) : queues.length === 0 ? (
              <p className="queues-status">No queues</p>
            ) : visibleQueues.length === 0 ? (
              <p className="queues-status">No queues match the search</p>
            ) : (
              <QueuesList queues={visibleQueues} onSelect={(queue) => openQueue(queue.name)} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
