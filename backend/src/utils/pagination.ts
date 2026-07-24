/**
 * Pagination Utility
 *
 * Provides standardized pagination support across all API list endpoints.
 * Supports both offset-based (page/limit) and cursor-based (cursor) pagination.
 *
 * Offset-based: ?page=1&limit=20
 * Cursor-based: ?cursor=base64encoded&limit=20
 */

export interface PaginationParams {
  page: number;
  limit: number;
  cursor?: string;
  offset: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasMore: boolean;
  nextCursor?: string | null;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
}

export interface PaginationQuery {
  page?: string | number;
  limit?: string | number;
  cursor?: string;
}

/** Default pagination values */
const DEFAULTS = {
  PAGE: 1,
  LIMIT: 20,
  MAX_LIMIT: 100,
};

/**
 * Parse and validate pagination parameters from query string.
 * Enforces max limit to prevent abuse.
 */
export function parsePagination(query: PaginationQuery): PaginationParams {
  const page = Math.max(
    1,
    parseInt(String(query.page ?? DEFAULTS.PAGE), 10) || DEFAULTS.PAGE,
  );
  const limit = Math.min(
    Math.max(
      1,
      parseInt(String(query.limit ?? DEFAULTS.LIMIT), 10) || DEFAULTS.LIMIT,
    ),
    DEFAULTS.MAX_LIMIT,
  );

  const cursor = query.cursor ? String(query.cursor).trim() : undefined;
  const offset = (page - 1) * limit;

  return { page, limit, cursor, offset };
}

/**
 * Build standardized pagination metadata.
 * Optionally generates a nextCursor for cursor-based pagination.
 */
export function paginateResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams,
): PaginatedResponse<T> {
  const { page, limit } = params;
  const pages = Math.max(1, Math.ceil(total / limit));
  const hasMore = page < pages;

  // Generate cursor for next page (encoded as base64 of last item's identifier)
  let nextCursor: string | null = null;
  if (hasMore && data.length > 0) {
    // The controller should provide a meaningful cursor key;
    // here we create a serialized cursor from page info as fallback.
    nextCursor = encodeCursor({ page: page + 1, limit });
  }

  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      pages,
      hasMore,
      nextCursor,
    },
  };
}

/**
 * Encode a cursor object into a base64 string.
 * Cursor objects typically contain { id, sortValue } for the last item.
 */
export function encodeCursor(cursorData: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(cursorData)).toString("base64");
}

/**
 * Decode a cursor string back into an object.
 * Returns null if decoding fails or cursor is invalid.
 */
export function decodeCursor(cursor: string): Record<string, unknown> | null {
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Create a paginated response for controllers that already have
 * their own data fetching logic — use this for consistency.
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
  nextCursor?: string | null,
): PaginatedResponse<T> {
  const pages = Math.max(1, Math.ceil(total / limit));
  const hasMore = page < pages;

  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      pages,
      hasMore,
      nextCursor: nextCursor ?? null,
    },
  };
}

/**
 * Apply pagination slice to an array (for in-memory pagination).
 * Useful for mock services or services that fetch all data then paginate.
 */
export function paginateArray<T>(items: T[], params: PaginationParams): T[] {
  return items.slice(params.offset, params.offset + params.limit);
}

export default {
  parsePagination,
  paginateResponse,
  createPaginatedResponse,
  encodeCursor,
  decodeCursor,
  paginateArray,
};
