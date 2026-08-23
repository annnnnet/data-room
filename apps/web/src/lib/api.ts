import type { ApiErrorBody, ErrorCode } from '@data-room/shared';
import { supabase } from './supabase';

const BASE = process.env.NEXT_PUBLIC_API_URL!;

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The share token, when present, is the credential for an anonymous visitor. */
let shareToken: string | null = null;
export function setShareToken(token: string | null) {
  shareToken = token;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  if (shareToken) headers['X-Share-Token'] = shareToken;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('INTERNAL', 'Could not reach the server. Check your connection and try again.', 0);
  }

  if (!res.ok) {
    // A non-JSON body means the response did not come from our API at all — a
    // proxy's HTML error page, a gateway timeout. Falling back to
    // VALIDATION_FAILED there would make callers that branch on that code to
    // show inline field errors misreport an infrastructure failure as bad input.
    const payload = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      payload?.code ?? 'INTERNAL',
      payload?.message ?? res.statusText,
      res.status,
      payload?.details,
    );
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  get: <T,>(p: string) => request<T>('GET', p),
  post: <T,>(p: string, b?: unknown) => request<T>('POST', p, b),
  patch: <T,>(p: string, b: unknown) => request<T>('PATCH', p, b),
  del: <T,>(p: string) => request<T>('DELETE', p),
};
