export function stringValue(
  query: Record<string, unknown>,
  key: string
): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Parses the pagination query (`page`, plus a keyed page-size param) with the
 * same clamping the jobs and logs endpoints share: 1-based pages and a page
 * size of at least 1, falling back to `defaultPageSize`.
 */
export function parsePageQuery(
  query: Record<string, unknown>,
  pageSizeKey: string,
  defaultPageSize: number
): { page: number; pageSize: number } {
  const page = Number(stringValue(query, 'page'));
  const pageSize = Number(stringValue(query, pageSizeKey));

  return {
    page: Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1,
    pageSize: Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : defaultPageSize,
  };
}

export function pageRange(page: number, pageSize: number): {
  start: number;
  end: number;
} {
  const start = (page - 1) * pageSize;
  return { start, end: start + pageSize - 1 };
}
