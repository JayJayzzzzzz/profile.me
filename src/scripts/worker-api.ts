/** Thin client for the Cloudflare Worker proxy (see worker/README.md). */
import { WORKER_ENDPOINT } from "../config";

const inflight = new Map<string, Promise<unknown>>();

/** True when a worker URL is configured — panels use this to decide their behaviour. */
export function workerReady(): boolean {
  return /^https?:\/\//.test(WORKER_ENDPOINT);
}

/** GET `<worker>/<path>` as JSON, de-duplicated and memoised for the session. */
export function workerFetch<T>(path: string): Promise<T> {
  const url = `${WORKER_ENDPOINT.replace(/\/$/, "")}${path}`;
  let pending = inflight.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${path} → ${response.status}`);
        return response.json();
      })
      .catch((error) => {
        inflight.delete(url); // let a later open() retry
        throw error;
      });
    inflight.set(url, pending);
  }
  return pending as Promise<T>;
}
