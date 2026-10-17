/**
 * 正規表現の6つの組（年・月・日・時・分・秒）から UTC の日時を作る。
 * 一致しない、または存在しない日時（13月、2月30日、25時など）なら null
 */
export function utcFromMatch(m: RegExpExecArray | null): Date | null {
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  const roundTrips =
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d &&
    date.getUTCHours() === h &&
    date.getUTCMinutes() === mi &&
    date.getUTCSeconds() === s;
  return roundTrips ? date : null;
}
