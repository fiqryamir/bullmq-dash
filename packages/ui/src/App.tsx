import { useEffect, useMemo, useState } from 'react';
import { readUiConfig, type UIConfig } from './config';
import { JobDetail } from './queues/JobDetail';
import { QueueJobs } from './queues/QueueJobs';
import { QueuesList } from './queues/QueuesList';
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
  const boardTitle = uiConfig.boardTitle ?? 'bullmq-dash';

  useEffect(() => {
    document.title = boardTitle;
  }, [boardTitle]);

  const visibleQueues = useMemo(
    () => queues.filter((queue) => queue.name.toLowerCase().includes(query.trim().toLowerCase())),
    [queues, query]
  );

  const selectedQueue = queues.find((queue) => queue.name === selectedQueueName);

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
            />
          ) : (
            <QueueJobs
              queue={selectedQueue}
              pollingInterval={pollingInterval}
              onBack={() => setSelectedQueueName(null)}
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
