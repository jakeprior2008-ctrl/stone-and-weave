const UA =
  'StoneAndWeave/1.0 (+https://github.com/jakeprior2008-ctrl/Test; vintage watch discovery, polite crawler)';

const lastHit = new Map<string, number>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch with a per-host delay, a timeout and bounded retries.
 * Never throws on HTTP status - callers decide what a 404 means.
 */
export async function politeFetch(
  url: string,
  opts: { delayMs?: number; timeoutMs?: number; retries?: number; accept?: string } = {},
): Promise<{ ok: boolean; status: number; text: string }> {
  const { delayMs = 1200, timeoutMs = 25_000, retries = 2 } = opts;
  const host = new URL(url).host;

  const since = Date.now() - (lastHit.get(host) ?? 0);
  if (since < delayMs) await sleep(delayMs - since);
  lastHit.set(host, Date.now());

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'user-agent': UA, accept: opts.accept ?? '*/*' },
      });
      const text = await res.text();
      clearTimeout(timer);
      // Retry transient server errors only; 4xx is a real answer.
      if (res.status >= 500 && attempt < retries) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      return { ok: res.ok, status: res.status, text };
    } catch (err) {
      clearTimeout(timer);
      if (attempt === retries) {
        return { ok: false, status: 0, text: String(err instanceof Error ? err.message : err) };
      }
      await sleep(2000 * (attempt + 1));
    }
  }
  return { ok: false, status: 0, text: 'unreachable' };
}
