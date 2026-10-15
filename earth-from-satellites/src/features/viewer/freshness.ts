export const STALE_THRESHOLD_MINUTES = 60;

export function staleMinutes(capturedAt: string, now: Date): number | null {
  const captured = Date.parse(capturedAt);
  if (Number.isNaN(captured)) return null;
  const minutes = Math.floor((now.getTime() - captured) / 60_000);
  return minutes >= STALE_THRESHOLD_MINUTES ? minutes : null;
}
