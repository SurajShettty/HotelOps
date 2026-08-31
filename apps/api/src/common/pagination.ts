const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Coerces raw (string) query params into safe page/pageSize + Prisma skip/take. */
export function normalizePagination(page?: string, pageSize?: string) {
  const p = Math.max(1, Math.trunc(Number(page)) || 1);
  const ps = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(pageSize)) || DEFAULT_PAGE_SIZE));
  return { page: p, pageSize: ps, skip: (p - 1) * ps, take: ps };
}
