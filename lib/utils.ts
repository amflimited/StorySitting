export function absoluteUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base}${path}`;
}

export function safeString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function makeInviteToken() {
  return crypto.randomUUID().replaceAll("-", "");
}
