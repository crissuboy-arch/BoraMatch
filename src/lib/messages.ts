export type ChatMessage = { id: string; createdAt: string };
// SQL orders by (created_at, id). Preserve sub-millisecond precision when merging.
export function mergeMessages<T extends ChatMessage>(current: T[], incoming: T[]): T[] {
  const unique = new Map(current.map(m => [m.id, m]));
  for (const m of incoming) unique.set(m.id, m);
  const micros = (s: string) => (s.match(/\.(\d+)/)?.[1] || "").padEnd(6, "0").slice(3, 6);
  return [...unique.values()].sort((a, b) => {
    const time = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (time) return time;
    const fraction = micros(a.createdAt).localeCompare(micros(b.createdAt));
    return fraction || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
