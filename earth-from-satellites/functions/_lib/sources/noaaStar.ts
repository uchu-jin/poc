const pad = (n: number, width: number) => String(n).padStart(width, '0');

export function toStarTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const dayOfYear = Math.floor((date.getTime() - Date.UTC(year, 0, 1)) / 86_400_000) + 1;
  return `${year}${pad(dayOfYear, 3)}${pad(date.getUTCHours(), 2)}${pad(date.getUTCMinutes(), 2)}`;
}
