import { useState, type FormEvent } from 'react';
import type { AppJobScheduler, AppQueue, JobSchedulerRepeatOptions } from '../api/contract';
import { addJobScheduler, removeJobScheduler, updateJobScheduler } from '../api/contract';
import { QueueNav, type QueueViewName } from './QueueNav';
import { describeSchedule, formatTimestamp } from './scheduleFormat';
import { useQueueSchedulers } from './useQueueSchedulers';

type QueueSchedulersProps = {
  queue: AppQueue;
  onBack: () => void;
  onSelectView: (view: QueueViewName) => void;
  showMetrics: boolean;
};

type ScheduleKind = 'pattern' | 'every';

const toDateTimeLocal = (ts?: number): string => {
  if (!ts) {
    return '';
  }
  const date = new Date(ts - new Date(ts).getTimezoneOffset() * 60 * 1000);
  return date.toISOString().slice(0, 16);
};

type FormState = {
  mode: 'add' | 'edit';
  scheduler?: AppJobScheduler;
  kind: ScheduleKind;
  id: string;
  pattern: string;
  every: string;
  tz: string;
  limit: string;
  endDate: string;
  jobName: string;
  jobData: string;
};

function initialForm(mode: 'add' | 'edit', scheduler?: AppJobScheduler): FormState {
  return {
    mode,
    ...(scheduler !== undefined ? { scheduler } : {}),
    kind: scheduler?.every ? 'every' : 'pattern',
    id: scheduler?.id ?? '',
    pattern: scheduler?.pattern ?? '',
    every: scheduler?.every ? String(scheduler.every) : '',
    tz: scheduler?.tz ?? '',
    limit: scheduler?.limit ? String(scheduler.limit) : '',
    endDate: toDateTimeLocal(scheduler?.endDate),
    jobName: scheduler?.name ?? '',
    jobData: '',
  };
}

export function QueueSchedulers({ queue, onBack, onSelectView, showMetrics }: QueueSchedulersProps) {
  const { schedulers, status, refresh } = useQueueSchedulers(queue.name);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (patch: Partial<FormState>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
    setFormError(null);
  };

  const openAdd = () => {
    setForm(initialForm('add'));
  };

  const openEdit = (scheduler: AppJobScheduler) => {
    setForm(initialForm('edit', scheduler));
  };

  const closeForm = () => {
    setForm(null);
    setFormError(null);
  };

  const readRepeat = (): JobSchedulerRepeatOptions | string => {
    if (!form) {
      return 'Form is not open';
    }
    if (form.kind === 'every') {
      const every = Number(form.every);
      if (!Number.isInteger(every) || every <= 0) {
        return 'Interval must be a positive number of milliseconds';
      }
      return {
        every,
        ...(form.limit ? { limit: Number(form.limit) } : {}),
        ...(form.endDate ? { endDate: new Date(form.endDate).getTime() } : {}),
      };
    }
    if (form.pattern.trim().length === 0) {
      return 'Cron pattern is required';
    }
    return {
      pattern: form.pattern.trim(),
      ...(form.tz.trim() ? { tz: form.tz.trim() } : {}),
      ...(form.limit ? { limit: Number(form.limit) } : {}),
      ...(form.endDate ? { endDate: new Date(form.endDate).getTime() } : {}),
    };
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) {
      return;
    }

    const repeat = readRepeat();
    if (typeof repeat === 'string') {
      setFormError(repeat);
      return;
    }

    let jobData: unknown;
    if (form.mode === 'add') {
      const trimmedId = form.id.trim();
      if (trimmedId.length === 0) {
        setFormError('A scheduler id is required');
        return;
      }
      if (form.jobData.trim().length > 0) {
        try {
          jobData = JSON.parse(form.jobData);
        } catch {
          setFormError('Job data must be valid JSON');
          return;
        }
      }
    }

    setBusy(true);
    setFormError(null);
    try {
      if (form.mode === 'add') {
        await addJobScheduler(queue.name, form.id.trim(), repeat, {
          ...(form.jobName.trim() ? { name: form.jobName.trim() } : {}),
          ...(jobData !== undefined ? { data: jobData } : {}),
        });
      } else if (form.scheduler) {
        await updateJobScheduler(queue.name, form.scheduler.id, repeat);
      }
      closeForm();
      refresh();
    } catch {
      setFormError('The scheduler could not be saved');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (scheduler: AppJobScheduler) => {
    if (!window.confirm(`Remove scheduler ${scheduler.id} in ${queue.name}?`)) {
      return;
    }
    setBusy(true);
    try {
      await removeJobScheduler(queue.name, scheduler.id);
      refresh();
    } catch {
      setFormError('The scheduler could not be removed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="queue-schedulers" aria-label={`Schedulers of ${queue.name}`}>
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
        <span className="queue-flow__subtitle">Schedulers</span>
        {!queue.readOnlyMode && (
          <button
            type="button"
            className="action-btn queue-jobs__view-action"
            onClick={form ? closeForm : openAdd}
            disabled={busy}
            aria-label={form ? 'Close scheduler form' : 'Add scheduler'}
          >
            {form ? 'Close' : 'Add scheduler'}
          </button>
        )}
      </header>

      <QueueNav queue={queue} active="schedulers" onSelect={onSelectView} showMetrics={showMetrics} />

      {form && (
        <form className="scheduler-form" onSubmit={submit} aria-label="Scheduler form">
          <div className="scheduler-form__grid">
            {form.mode === 'add' && (
              <label className="scheduler-form__field">
                <span>ID</span>
                <input
                  value={form.id}
                  onChange={(event) => set({ id: event.target.value })}
                  aria-label="Scheduler id"
                  required
                />
              </label>
            )}
            <label className="scheduler-form__field">
              <span>Schedule</span>
              <select
                value={form.kind}
                onChange={(event) => set({ kind: event.target.value as ScheduleKind })}
                aria-label="Schedule kind"
              >
                <option value="every">Interval</option>
                <option value="pattern">Cron pattern</option>
              </select>
            </label>
            {form.kind === 'every' ? (
              <label className="scheduler-form__field">
                <span>Every (ms)</span>
                <input
                  type="number"
                  min={1}
                  value={form.every}
                  onChange={(event) => set({ every: event.target.value })}
                  aria-label="Interval in milliseconds"
                  required
                />
              </label>
            ) : (
              <>
                <label className="scheduler-form__field">
                  <span>Cron pattern</span>
                  <input
                    value={form.pattern}
                    placeholder="0 3 * * *"
                    onChange={(event) => set({ pattern: event.target.value })}
                    aria-label="Cron pattern"
                    required
                  />
                </label>
                <label className="scheduler-form__field">
                  <span>Timezone</span>
                  <input
                    value={form.tz}
                    placeholder="UTC"
                    onChange={(event) => set({ tz: event.target.value })}
                    aria-label="Timezone"
                  />
                </label>
              </>
            )}
            <label className="scheduler-form__field">
              <span>Limit</span>
              <input
                type="number"
                min={1}
                value={form.limit}
                onChange={(event) => set({ limit: event.target.value })}
                aria-label="Run limit"
              />
            </label>
            <label className="scheduler-form__field">
              <span>End date</span>
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={(event) => set({ endDate: event.target.value })}
                aria-label="End date"
              />
            </label>
            {form.mode === 'add' && (
              <>
                <label className="scheduler-form__field">
                  <span>Job name</span>
                  <input
                    value={form.jobName}
                    onChange={(event) => set({ jobName: event.target.value })}
                    aria-label="Job name"
                  />
                </label>
                <label className="scheduler-form__field scheduler-form__field--wide">
                  <span>Job data (JSON)</span>
                  <textarea
                    value={form.jobData}
                    placeholder={'{"key": "value"}'}
                    onChange={(event) => set({ jobData: event.target.value })}
                    aria-label="Job data"
                  />
                </label>
              </>
            )}
          </div>
          <div className="scheduler-form__actions">
            <button type="submit" className="action-btn" disabled={busy}>
              {form.mode === 'add' ? 'Add' : 'Save'}
            </button>
            <button type="button" className="action-btn" onClick={closeForm} disabled={busy}>
              Cancel
            </button>
            {formError && (
              <span className="queues-status queues-status--error" role="alert">
                {formError}
              </span>
            )}
          </div>
        </form>
      )}

      {status === 'loading' ? (
        <p className="queues-status">Loading schedulers…</p>
      ) : status === 'error' ? (
        <p className="queues-status queues-status--error" role="alert">
          Failed to load schedulers
        </p>
      ) : schedulers.length === 0 ? (
        <p className="queues-status">No repeatable jobs scheduled</p>
      ) : (
        <div className="queue-schedulers__table-wrap">
          <table className="job-table">
            <thead>
              <tr>
                <th scope="col">Scheduler</th>
                <th scope="col">Schedule</th>
                <th scope="col">Next run</th>
                <th scope="col">Last run</th>
                <th scope="col">Runs</th>
                {!queue.readOnlyMode && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {schedulers.map((scheduler) => (
                <tr key={scheduler.id}>
                  <td>
                    <span className="job-cell__id">{scheduler.id}</span>
                    <div className="queue-schedulers__job-name">{scheduler.name || '-'}</div>
                  </td>
                  <td>
                    <code className="queue-schedulers__schedule">{describeSchedule(scheduler)}</code>
                    {scheduler.tz && <div className="queue-schedulers__meta">{scheduler.tz}</div>}
                  </td>
                  <td>{formatTimestamp(scheduler.next)}</td>
                  <td>{formatTimestamp(scheduler.lastRun)}</td>
                  <td>
                    {scheduler.iterationCount ?? '-'}
                    {scheduler.limit ? <span className="queue-schedulers__meta"> of {scheduler.limit}</span> : null}
                  </td>
                  {!queue.readOnlyMode && (
                    <td>
                      <span className="job-cell__actions">
                        <button
                          type="button"
                          className="action-btn"
                          aria-label={`Edit scheduler ${scheduler.id}`}
                          disabled={busy}
                          onClick={() => openEdit(scheduler)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          aria-label={`Remove scheduler ${scheduler.id}`}
                          disabled={busy}
                          onClick={() => void remove(scheduler)}
                        >
                          Remove
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
