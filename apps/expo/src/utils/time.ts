type TimestampLike =
  | { toMillis: () => number }
  | { toDate: () => Date }
  | { seconds: number; nanoseconds?: number }
  | number
  | string
  | null
  | undefined;

function timestampToMillis(value: TimestampLike): number | null {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'object') {
    const any = value as any;
    if (typeof any.toMillis === 'function') {
      try {
        return any.toMillis();
      } catch {
        // ignore
      }
    }
    if (typeof any.toDate === 'function') {
      try {
        return any.toDate().getTime();
      } catch {
        // ignore
      }
    }
    if (typeof any.seconds === 'number') {
      return any.seconds * 1000;
    }
  }
  return null;
}

export function formatTimestampDate(value: TimestampLike, fallback = 'Teraz'): string {
  const ms = timestampToMillis(value);
  if (ms === null) return fallback;
  return new Date(ms).toLocaleDateString();
}


