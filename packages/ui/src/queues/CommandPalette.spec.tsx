import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SearchResponse, SearchResult } from '../api/contract';
import { makeJob } from '../testUtils/fixtures';
import { CommandPalette } from './CommandPalette';

function searchResponse(results: SearchResult[], overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    term: 'mail',
    count: results.length,
    totalScanned: results.length,
    deepen: false,
    results,
    ...overrides,
  };
}

function stubSearchApi(...responses: SearchResponse[]) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => response,
    });
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const mailResult = (id: string, overrides: Partial<SearchResult> = {}): SearchResult => ({
  queue: 'emails',
  job: makeJob(0, { id, name: `${id}-name` }),
  state: 'waiting',
  ...overrides,
});

const searchInput = (): HTMLInputElement => screen.getByRole('searchbox', { name: 'Search jobs' });

async function typeAndWait(text: string) {
  fireEvent.change(searchInput(), { target: { value: text } });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CommandPalette', () => {
  it('does not apply the dialog scrim to the embedded palette surface', () => {
    render(<CommandPalette onSelectJob={() => {}} />);

    expect(screen.getByRole('region', { name: 'Job search' })).not.toHaveClass('dash-dialog');
  });

  it('debounces typing for 300ms and renders the matched jobs', async () => {
    vi.useFakeTimers();
    const fetchMock = stubSearchApi(
      searchResponse([
        mailResult('mail-1'),
        mailResult('mail-2', {
          job: makeJob(1, { id: 'mail-2', name: 'later-mail' }),
          state: 'delayed',
        }),
      ])
    );

    render(<CommandPalette onSelectJob={() => {}} />);
    fireEvent.change(searchInput(), { target: { value: 'mail' } });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchMock).toHaveBeenCalledWith('api/search?term=mail');

    expect(screen.getByText('mail-1-name')).toBeInTheDocument();
    expect(screen.getByText('later-mail')).toBeInTheDocument();
    expect(within(screen.getByTestId('palette-scroll')).getByText('Delayed')).toBeInTheDocument();
    expect(within(screen.getByTestId('palette-scroll')).getAllByText('emails')).toHaveLength(2);
  });

  it('narrows the search through the state chips', async () => {
    vi.useFakeTimers();
    const fetchMock = stubSearchApi(
      searchResponse([mailResult('mail-1')]),
      searchResponse([mailResult('mail-1', { state: 'delayed' })])
    );

    render(<CommandPalette onSelectJob={() => {}} />);
    await typeAndWait('mail');

    fireEvent.click(screen.getByRole('button', { name: 'Delayed' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenLastCalledWith('api/search?term=mail&status=delayed');
    expect(screen.getByRole('button', { name: 'Delayed' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Delayed' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenLastCalledWith('api/search?term=mail');
  });

  it('opens the job detail when a result is selected', async () => {
    vi.useFakeTimers();
    stubSearchApi(searchResponse([mailResult('mail-1')]));
    const onSelectJob = vi.fn();

    render(<CommandPalette onSelectJob={onSelectJob} />);
    await typeAndWait('mail');

    fireEvent.click(screen.getByRole('button', { name: /mail-1/ }));
    expect(onSelectJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queue: 'emails',
        state: 'waiting',
        job: expect.objectContaining({ id: 'mail-1' }),
      })
    );
  });

  it('deepens the search past the cap and appends the results', async () => {
    vi.useFakeTimers();
    const fetchMock = stubSearchApi(
      searchResponse([mailResult('mail-1')], { count: 1, totalScanned: 3, deepen: true }),
      searchResponse([mailResult('mail-2')], { count: 1, totalScanned: 2, deepen: false })
    );

    render(<CommandPalette onSelectJob={() => {}} />);
    await typeAndWait('mail');

    fireEvent.click(screen.getByRole('button', { name: 'Deepen search' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(fetchMock).toHaveBeenLastCalledWith('api/search?term=mail&start=3');
    expect(screen.getByText('mail-1-name')).toBeInTheDocument();
    expect(screen.getByText('mail-2-name')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deepen search' })).not.toBeInTheDocument();
  });

  it('scopes the search to a queue when queueName is given', async () => {
    vi.useFakeTimers();
    const fetchMock = stubSearchApi(searchResponse([mailResult('mail-1')]));

    render(<CommandPalette onSelectJob={() => {}} queueName="emails" />);
    expect(screen.getByRole('searchbox', { name: 'Search jobs' })).toHaveAttribute(
      'placeholder',
      'Search jobs in emails…'
    );

    await typeAndWait('mail');
    expect(fetchMock).toHaveBeenCalledWith('api/queues/emails/search?term=mail');
    expect(within(screen.getByTestId('palette-scroll')).queryByText('emails')).not.toBeInTheDocument();
  });

  it('reports an empty result set', async () => {
    vi.useFakeTimers();
    stubSearchApi(searchResponse([]));

    render(<CommandPalette onSelectJob={() => {}} />);
    await typeAndWait('nothing-matches');

    expect(screen.getByText('No jobs match')).toBeInTheDocument();
  });

  it('reports a failed search', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    render(<CommandPalette onSelectJob={() => {}} />);
    await typeAndWait('mail');

    expect(screen.getByText('Search failed')).toBeInTheDocument();
  });
});
