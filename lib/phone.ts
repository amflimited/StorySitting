export function normalizeUsPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (value.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
}
export function maskPhone(value: string) {
  const normalized = normalizeUsPhone(value);
  if (!normalized) return "Phone number on file";
  return `••• ••• ${normalized.slice(-4)}`;
}
