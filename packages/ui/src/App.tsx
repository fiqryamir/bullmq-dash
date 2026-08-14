import { useEffect, useMemo, useState } from 'react';
import { readUiConfig, type UIConfig } from './config';
import { CommandPalette } from './queues/CommandPalette';
import { JobDetail } from './queues/JobDetail';
import { QueueFlow } from './queues/QueueFlow';
import { QueueJobs } from './queues/QueueJobs';
import { QueuesList } from './queues/QueuesList';
import type { FlowNode } from './api/contract';
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
  const [flowOpen, setFlowOpen] = useState(false);
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
    setFlowOpen(false);
  };

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__brand">{boardTitle}</span>
        <ThemeToggle />
      </header>
      <main className={selectedQueue ? 'app__main app__main--queue' : 'app__main'}>
        {selectedQueue ? (
          flowOpen && !selectedJobId ? (
            <QueueFlow
              queue={selectedQueue}
              pollingInterval={pollingInterval}
              onBack={() => setFlowOpen(false)}
              onSelectNode={selectFlowNode}
            />
          ) : selectedJobId ? (
            <JobDetail
              queue={selectedQueue}
              jobId={selectedJobId}
              pollingInterval={pollingInterval}
              onBack={() => setSelectedJobId(null)}
              onSelectNode={selectFlowNode}
            />
          ) : (
            <QueueJobs
              queue={selectedQueue}
              pollingInterval={pollingInterval}
              onBack={() => setSelectedQueueName(null)}
              onSelectJob={(job) => job.id && setSelectedJobId(job.id)}
              onShowFlow={() => setFlowOpen(true)}
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
                setSelectedQueueName(result.queue);
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
              <QueuesList queues={visibleQueues} onSelect={(queue) => setSelectedQueueName(queue.name)} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
