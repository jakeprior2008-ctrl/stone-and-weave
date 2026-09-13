/**
 * Pinned selections: your own shortlist, kept in this browser.
 *
 * Deliberately localStorage rather than a backend - there is no server to add
 * one to, and a shortlist is personal. Every read and write is guarded because
 * private mode and blocked site data make these throw rather than return null.
 */
const KEY = 'stone-and-weave:pins';

export function loadPins(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function savePins(pins: Set<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...pins]));
  } catch {
    /* pinning still works for this session, it just will not survive a reload */
  }
}

export function togglePin(pins: Set<string>, id: string): Set<string> {
  const next = new Set(pins);
  if (!next.delete(id)) next.add(id);
  savePins(next);
  return next;
}
