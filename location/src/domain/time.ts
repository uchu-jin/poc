export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

export function formatHHMM(iso: string, timeZone?: string): string {
  const fmt = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });
  return fmt.format(new Date(iso));
}
