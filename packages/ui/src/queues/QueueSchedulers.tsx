import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        return t('ERRORS.INVALID_SCHEDULER_INTERVAL');
      }
      return {
        every,
        ...(form.limit ? { limit: Number(form.limit) } : {}),
        ...(form.endDate ? { endDate: new Date(form.endDate).getTime() } : {}),
      };
    }
    if (form.pattern.trim().length === 0) {
      return t('SCHEDULERS.CRON_REQUIRED');
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
        setFormError(t('SCHEDULERS.ID_REQUIRED'));
        return;
      }
      if (form.jobData.trim().length > 0) {
        try {
          jobData = JSON.parse(form.jobData);
        } catch {
          setFormError(t('SCHEDULERS.JSON_INVALID'));
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
      setFormError(t('SCHEDULERS.SAVE_FAILED'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (scheduler: AppJobScheduler) => {
    if (!window.confirm(t('SCHEDULERS.REMOVE_CONFIRM', { id: scheduler.id, queue: queue.name }))) {
      return;
    }
    setBusy(true);
    try {
      await removeJobScheduler(queue.name, scheduler.id);
      refresh();
    } catch {
      setFormError(t('SCHEDULERS.REMOVE_FAILED'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="queue-schedulers" aria-label={t('SCHEDULERS.VIEW_ARIA', { queue: queue.name })}>
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
        <span className="queue-flow__subtitle">{t('SCHEDULERS.TITLE')}</span>
        {!queue.readOnlyMode && (
          <button
            type="button"
            className="action-btn queue-jobs__view-action"
            onClick={form ? closeForm : openAdd}
            disabled={busy}
            aria-label={form ? t('SCHEDULERS.CLOSE_FORM_ARIA') : t('SCHEDULERS.ADD_ARIA')}
          >
            {form ? t('SCHEDULERS.CLOSE_FORM') : t('SCHEDULERS.ADD')}
          </button>
        )}
      </header>

      <QueueNav queue={queue} active="schedulers" onSelect={onSelectView} showMetrics={showMetrics} />

      {form && (
        <form className="scheduler-form" onSubmit={submit} aria-label={t('SCHEDULERS.FORM_ARIA')}>
          <div className="scheduler-form__grid">
            {form.mode === 'add' && (
              <label className="scheduler-form__field">
                <span>{t('COMMON.ID')}</span>
                <input
                  value={form.id}
                  onChange={(event) => set({ id: event.target.value })}
                  aria-label={t('SCHEDULERS.ID_ARIA')}
                  required
                />
              </label>
            )}
            <label className="scheduler-form__field">
              <span>{t('SCHEDULERS.KIND')}</span>
              <select
                value={form.kind}
                onChange={(event) => set({ kind: event.target.value as ScheduleKind })}
                aria-label={t('SCHEDULERS.KIND_ARIA')}
              >
                <option value="every">{t('SCHEDULERS.EDIT.KIND_EVERY')}</option>
                <option value="pattern">{t('SCHEDULERS.EDIT.KIND_PATTERN')}</option>
              </select>
            </label>
            {form.kind === 'every' ? (
              <label className="scheduler-form__field">
                <span>{t('SCHEDULERS.EVERY_MS')}</span>
                <input
                  type="number"
                  min={1}
                  value={form.every}
                  onChange={(event) => set({ every: event.target.value })}
                  aria-label={t('SCHEDULERS.EVERY_ARIA')}
                  required
                />
              </label>
            ) : (
              <>
                <label className="scheduler-form__field">
                  <span>{t('SCHEDULERS.EDIT.KIND_PATTERN')}</span>
                  <input
                    value={form.pattern}
                    placeholder="0 3 * * *"
                    onChange={(event) => set({ pattern: event.target.value })}
                    aria-label={t('SCHEDULERS.PATTERN_ARIA')}
                    required
                  />
                </label>
                <label className="scheduler-form__field">
                  <span>{t('SCHEDULERS.TZ')}</span>
                  <input
                    value={form.tz}
                    placeholder="UTC"
                    onChange={(event) => set({ tz: event.target.value })}
                    aria-label={t('SCHEDULERS.TZ_ARIA')}
                  />
                </label>
              </>
            )}
            <label className="scheduler-form__field">
              <span>{t('SCHEDULERS.LIMIT')}</span>
              <input
                type="number"
                min={1}
                value={form.limit}
                onChange={(event) => set({ limit: event.target.value })}
                aria-label={t('SCHEDULERS.LIMIT_ARIA')}
              />
            </label>
            <label className="scheduler-form__field">
              <span>{t('SCHEDULERS.EDIT.END_DATE')}</span>
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={(event) => set({ endDate: event.target.value })}
                aria-label={t('SCHEDULERS.END_DATE_ARIA')}
              />
            </label>
            {form.mode === 'add' && (
              <>
                <label className="scheduler-form__field">
                  <span>{t('ADD_JOB.JOB_NAME')}</span>
                  <input
                    value={form.jobName}
                    onChange={(event) => set({ jobName: event.target.value })}
                    aria-label={t('SCHEDULERS.NAME_ARIA')}
                  />
                </label>
                <label className="scheduler-form__field scheduler-form__field--wide">
                  <span>{t('SCHEDULERS.JOB_DATA_JSON')}</span>
                  <textarea
                    value={form.jobData}
                    placeholder={'{"key": "value"}'}
                    onChange={(event) => set({ jobData: event.target.value })}
                    aria-label={t('SCHEDULERS.DATA_ARIA')}
                  />
                </label>
              </>
            )}
          </div>
          <div className="scheduler-form__actions">
            <button type="submit" className="action-btn" disabled={busy}>
              {form.mode === 'add' ? t('ADD_JOB.ADD') : t('SCHEDULERS.EDIT.SAVE')}
            </button>
            <button type="button" className="action-btn" onClick={closeForm} disabled={busy}>
              {t('CONFIRM.CANCEL_BTN')}
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
        <p className="queues-status">{t('SCHEDULERS.LOADING')}</p>
      ) : status === 'error' ? (
        <p className="queues-status queues-status--error" role="alert">
          {t('SCHEDULERS.LOAD_FAILED')}
        </p>
      ) : schedulers.length === 0 ? (
        <p className="queues-status">{t('SCHEDULERS.NO_SCHEDULERS')}</p>
      ) : (
        <div className="queue-schedulers__table-wrap">
          <table className="job-table">
            <thead>
              <tr>
                <th scope="col">{t('SCHEDULERS.COLUMNS.SCHEDULER')}</th>
                <th scope="col">{t('SCHEDULERS.COLUMNS.SCHEDULE')}</th>
                <th scope="col">{t('SCHEDULERS.COLUMNS.NEXT_RUN')}</th>
                <th scope="col">{t('SCHEDULERS.COLUMNS.LAST_RUN')}</th>
                <th scope="col">{t('SCHEDULERS.COLUMNS.RUNS')}</th>
                {!queue.readOnlyMode && <th scope="col">{t('COMMON.ACTIONS')}</th>}
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
                    <code className="queue-schedulers__schedule">{describeSchedule(scheduler, t)}</code>
                    {scheduler.tz && <div className="queue-schedulers__meta">{scheduler.tz}</div>}
                  </td>
                  <td>{formatTimestamp(scheduler.next)}</td>
                  <td>{formatTimestamp(scheduler.lastRun)}</td>
                  <td>
                    {scheduler.iterationCount ?? '-'}
                    {scheduler.limit ? (
                      <span className="queue-schedulers__meta">
                        {' '}
                        {t('SCHEDULERS.OF_LIMIT', { limit: scheduler.limit })}
                      </span>
                    ) : null}
                  </td>
                  {!queue.readOnlyMode && (
                    <td>
                      <span className="job-cell__actions">
                        <button
                          type="button"
                          className="action-btn"
                          aria-label={t('SCHEDULERS.EDIT_ARIA', { id: scheduler.id })}
                          disabled={busy}
                          onClick={() => openEdit(scheduler)}
                        >
                          {t('COMMON.EDIT')}
                        </button>
                        <button
                          type="button"
                          className="action-btn"
                          aria-label={t('SCHEDULERS.REMOVE_ARIA', { id: scheduler.id })}
                          disabled={busy}
                          onClick={() => void remove(scheduler)}
                        >
                          {t('COMMON.REMOVE')}
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
