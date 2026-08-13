import { useEffect, useMemo, useState } from 'react';
import { readUiConfig, type UIConfig } from './config';
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
  const boardTitle = uiConfig.boardTitle ?? 'bullmq-dash';

  useEffect(() => {
    document.title = boardTitle;
  }, [boardTitle]);

  const visibleQueues = useMemo(
    () => queues.filter((queue) => queue.name.toLowerCase().includes(query.trim().toLowerCase())),
    [queues, query]
  );

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__brand">{boardTitle}</span>
        <ThemeToggle />
      </header>
      <main className="app__main">
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
          <QueuesList queues={visibleQueues} />
        )}
      </main>
    </div>
  );
}
