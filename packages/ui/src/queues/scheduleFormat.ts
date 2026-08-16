import type { TFunction } from 'i18next';
import type { AppJobScheduler } from '../api/contract';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * An `every` interval as a duration a person reads at a glance. Anything
 * that does not divide evenly keeps the smaller unit rather than rounding,
 * so 90 minutes stays 90 minutes. The units are bull-board's compact
 * `SCHEDULERS.INTERVAL` forms, so the phrase translates in every locale.
 */
export function formatInterval(every: number, t: TFunction): string {
  if (every % DAY === 0) {
    return t('SCHEDULERS.INTERVAL.DAYS', { count: every / DAY });
  }
  if (every % HOUR === 0) {
    return t('SCHEDULERS.INTERVAL.HOURS', { count: every / HOUR });
  }
  if (every % MINUTE === 0) {
    return t('SCHEDULERS.INTERVAL.MINUTES', { count: every / MINUTE });
  }
  if (every % 1000 === 0) {
    return t('SCHEDULERS.INTERVAL.SECONDS', { count: every / 1000 });
  }
  return t('SCHEDULERS.INTERVAL.MILLISECONDS', { count: every });
}

export function describeSchedule(scheduler: AppJobScheduler, t: TFunction): string {
  if (scheduler.pattern) {
    return scheduler.pattern;
  }
  if (scheduler.every) {
    return t('SCHEDULERS.EVERY', { interval: formatInterval(scheduler.every, t) });
  }
  return '-';
}

export function formatTimestamp(ts?: number): string {
  if (!ts) {
    return '-';
  }
  return new Date(ts).toLocaleString();
}

export function formatAge(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 60 * 60) {
    return `${Math.round(seconds / 60)}m`;
  }
  if (seconds < 24 * 60 * 60) {
    return `${Math.round(seconds / (60 * 60))}h`;
  }
  return `${Math.round(seconds / (24 * 60 * 60))}d`;
}
