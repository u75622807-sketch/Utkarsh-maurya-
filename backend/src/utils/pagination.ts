export interface PageParams {
  page: number;
  pageSize: number;
}

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function parsePageParams(query: { page?: unknown; pageSize?: unknown }, max = 100): PageParams {
  let page = Number(query.page ?? 1);
  let pageSize = Number(query.pageSize ?? 20);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > max) pageSize = max;
  return { page: Math.floor(page), pageSize: Math.floor(pageSize) };
}

export function paginate<T>(items: T[], total: number, p: PageParams): Page<T> {
  return {
    data: items,
    page: p.page,
    pageSize: p.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}
