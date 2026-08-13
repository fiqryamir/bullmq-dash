export function stringValue(
  query: Record<string, unknown>,
  key: string
): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

export function pageRange(page: number, jobsPerPage: number): {
  start: number;
  end: number;
} {
  const start = (page - 1) * jobsPerPage;
  return { start, end: start + jobsPerPage - 1 };
}
