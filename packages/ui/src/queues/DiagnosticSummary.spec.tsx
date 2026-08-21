import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AppJob, JobStatus } from '../api/contract';
import { DiagnosticSummary } from './DiagnosticSummary';

function job(overrides: Partial<AppJob>): AppJob {
  return {
    id: 'j1',
    name: 'welcome-email',
    progress: 0,
    attempts: 1,
    timestamp: 1700000000000,
    stacktrace: [],
    opts: {},
    data: {},
    ...overrides,
  };
}

function renderSummary(jobOverrides: Partial<AppJob>, status: JobStatus | 'unknown') {
  render(<DiagnosticSummary job={job(jobOverrides)} status={status} />);
  return screen.getByTestId('diagnostic-summary');
}

describe('DiagnosticSummary', () => {
  it('leads a rich failed retried job with its outcome, attempt count and latest run evidence', () => {
    const summary = renderSummary(
      {
        attempts: 2,
        failedReason: 'kaboom',
        stacktrace: ['Error: kaboom'],
        processedOn: 1700000000100,
        finishedOn: 1700000000200,
        processedBy: 'worker-1',
      },
      'failed'
    );

    expect(summary).toHaveTextContent(/failed with: kaboom/i);
    expect(summary).toHaveTextContent(/2 attempts/i);
    expect(summary).toHaveTextContent(/earlier attempts are not retained/i);
    expect(summary).toHaveTextContent(/inspect its stack trace below/i);
    expect(summary.textContent).not.toMatch(/no timing or worker evidence/i);
  });

  it('names the evidence gaps of a gap-heavy failed retried job instead of inferring values', () => {
    const summary = renderSummary(
      {
        attempts: 3,
        stacktrace: ['Error: boom'],
      },
      'failed'
    );

    expect(summary).toHaveTextContent(/latest retained run of this job failed/i);
    expect(summary).toHaveTextContent(/3 attempts/i);
    expect(summary).toHaveTextContent(/earlier attempts are not retained/i);
    expect(summary).toHaveTextContent(/no timing or worker evidence is retained/i);
    expect(summary.textContent).not.toMatch(/undefined|Invalid Date|NaN/);
  });

  it('names the missing worker when only timing is retained', () => {
    const summary = renderSummary(
      { processedOn: 1700000000100, finishedOn: 1700000000200 },
      'failed'
    );

    expect(summary).toHaveTextContent(/no worker attribution is retained/i);
  });

  it('names incomplete timing when only the finish time is retained', () => {
    const summary = renderSummary({ finishedOn: 1700000000200 }, 'failed');

    expect(summary).toHaveTextContent(/no complete timing is retained/i);
    expect(summary.textContent).not.toMatch(/no timing or worker evidence/i);
  });

  it('names the missing timing when only the worker is retained', () => {
    const summary = renderSummary({ processedBy: 'worker-1' }, 'completed');

    expect(summary).toHaveTextContent(/no complete timing is retained/i);
  });

  it('states a completed job without failure language and without gap claims when evidence is rich', () => {
    const summary = renderSummary(
      {
        attempts: 1,
        returnValue: { delivered: true },
        processedOn: 1700000000100,
        finishedOn: 1700000000200,
        processedBy: 'worker-1',
      },
      'completed'
    );

    expect(summary).toHaveTextContent(/completed successfully/i);
    expect(summary).toHaveTextContent(/compare its result below/i);
    expect(summary.textContent).not.toMatch(/fail|not retained/i);
  });

  it.each([
    ['waiting', /waiting to be processed/i],
    ['delayed', /delayed/i],
    ['paused', /paused/i],
    ['waiting-children', /waiting for its children/i],
    ['prioritized', /prioritized/i],
  ] as const)('describes a %s job truthfully without failure claims', (status, expected) => {
    const summary = renderSummary({}, status);

    expect(summary).toHaveTextContent(expected);
    expect(summary).toHaveTextContent(/updates as the job progresses/i);
    expect(summary.textContent).not.toMatch(/fail/i);
  });

  it('says an unknown state could not be determined without inventing a story', () => {
    const summary = renderSummary({}, 'unknown');

    expect(summary).toHaveTextContent(/could not be determined/i);
    expect(summary.textContent).not.toMatch(/fail|progresses/i);
  });

  it('describes an active job with its current run evidence when retained', () => {
    const summary = renderSummary(
      {
        attempts: 3,
        processedOn: 1700000000100,
        processedBy: 'worker-1',
      },
      'active'
    );

    expect(summary).toHaveTextContent(/being processed right now/i);
    expect(summary).toHaveTextContent(new Date(1700000000100).toISOString());
    expect(summary).toHaveTextContent(/worker-1/);
    expect(summary).toHaveTextContent(/3 attempts/i);
    expect(summary).toHaveTextContent(/updates as the job progresses/i);
    expect(summary.textContent).not.toMatch(/fail/i);
  });
});
