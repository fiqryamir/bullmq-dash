import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { COUNTS, makeJob, makeQueue } from '../testUtils/fixtures';
import { LOCALE_STORAGE_KEY, i18n } from './index';
import { FALLBACK_LNG, LANGUAGES } from './languages';

function stubQueuesApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        queues: [makeQueue({ name: 'emails', counts: { ...COUNTS, waiting: 7 } })],
      }),
    })
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  void i18n.changeLanguage(FALLBACK_LNG);
});

describe('LocaleSelect', () => {
  it('offers every shipped language by its native name', () => {
    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);
    const select = screen.getByRole('combobox');
    for (const language of LANGUAGES) {
      expect(screen.getByRole('option', { name: language.name })).toBeInTheDocument();
    }
    expect(select).toHaveValue(FALLBACK_LNG);
  });

  it('switches the dashboard language and remembers the choice', async () => {
    stubQueuesApi();
    const user = userEvent.setup();
    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);

    await screen.findByText('emails');
    expect((await screen.findAllByText('Waiting')).length).toBeGreaterThan(0);

    await user.selectOptions(screen.getByRole('combobox'), 'de-DE');

    await waitFor(() => expect(i18n.language).toBe('de-DE'));
    expect((await screen.findAllByText('Wartend')).length).toBeGreaterThan(0);
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('de-DE');
  });

  it('renders the shared bull-board strings translated inside the queue views', async () => {
    const fetchMock = vi.fn((url: string) => {
      const target = String(url);
      if (target.startsWith('api/queues/emails/jobs')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            jobs: [makeJob(0, { id: 'a1', name: 'welcome-email', state: 'failed' })],
            pagination: { pageCount: 1, range: { start: 0, end: 99 } },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ queues: [makeQueue({ name: 'emails' })] }),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();

    render(<App uiConfig={{ pollingInterval: { forceInterval: 0 } }} />);
    await user.selectOptions(screen.getByRole('combobox'), 'de-DE');
    await waitFor(() => expect(i18n.language).toBe('de-DE'));
    await user.click(await screen.findByRole('button', { name: /emails/ }));

    expect(await screen.findByText('Wiederholen')).toBeInTheDocument();
    const states = screen.getByRole('group', { name: 'Job states' });
    expect(within(states).getByRole('button', { name: /Wartend/ })).toBeInTheDocument();
  });
});
