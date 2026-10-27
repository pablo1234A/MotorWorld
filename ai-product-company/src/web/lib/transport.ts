/**
 * Transport seam. The UI talks HTTP + SSE to the server edition; the single-file
 * browser edition installs a local transport that runs the whole company in-page.
 */
export interface LocalTransport {
  edition: 'browser';
  request(method: string, url: string, body: unknown): Promise<{ status: number; data: unknown }>;
  subscribe(listener: (type: 'company' | 'activity', data: unknown) => void): () => void;
  mediaUrl(id: string): string;
}

declare global {
  interface Window {
    __APC_LOCAL__?: LocalTransport;
  }
}

export const localTransport = (): LocalTransport | undefined => window.__APC_LOCAL__;
export const isBrowserEdition = () => Boolean(window.__APC_LOCAL__);
