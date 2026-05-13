export type MaybeArray<T> = T | T[] | null | undefined;

export function firstRelated<T>(value: MaybeArray<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function safeStatus(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "unknown";
}

export function safeDate(value: string | null | undefined) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleDateString();
}

export function percent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}
