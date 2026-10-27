import { localTransport } from './transport';
/** Thin API client. Cookies carry the session; the custom header is the CSRF guard. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}


async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const local = localTransport();
  if (local) {
    const { status, data } = await local.request(method, url, body);
    if (status >= 400) {
      const d = data as { error?: string; code?: string } | null;
      throw new ApiError(d?.error ?? `Error ${status}`, status, d?.code);
    }
    return data as T;
  }
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? {} : { 'x-requested-with': 'apc', ...(isForm ? {} : { 'content-type': 'application/json' }) },
    body: method === 'GET' ? undefined : isForm ? body : JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth')) window.dispatchEvent(new Event('apc:unauthorized'));
    throw new ApiError(data?.error ?? res.statusText, res.status, data?.code);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
  upload: <T>(url: string, files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('file', f, f.name));
    return request<T>('POST', url, fd);
  },
};

export const mediaUrl = (id: string | null | undefined, download = false) => {
  if (!id) return '';
  const local = localTransport();
  if (local) return local.mediaUrl(id);
  return `/api/media/${id}${download ? '?download=1' : ''}`;
};
