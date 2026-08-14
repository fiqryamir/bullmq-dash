import type { AppJobScheduler } from '../api/contract';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * An `every` interval as a duration a person reads at a glance. Anything
 * that does not divide evenly keeps the smaller unit rather than rounding,
 * so 90 minutes stays 90 minutes.
 */
export function formatInterval(every: number): string {
  if (every % DAY === 0) {
    return `${every / DAY} days`;
  }
  if (every % HOUR === 0) {
    return `${every / HOUR} hours`;
  }
  if (every % MINUTE === 0) {
    return `${every / MINUTE} minutes`;
  }
  if (every % 1000 === 0) {
    return `${every / 1000} seconds`;
  }
  return `${every} ms`;
}

export function describeSchedule(scheduler: AppJobScheduler): string {
  if (scheduler.pattern) {
    return scheduler.pattern;
  }
  if (scheduler.every) {
    return `every ${formatInterval(scheduler.every)}`;
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
