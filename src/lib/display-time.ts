const zone = "Asia/Kolkata";
const dateFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: zone, day: "2-digit", month: "short", year: "numeric" });
const timeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function displayTime(value: string | Date | null | undefined) {
  if (!value) return { date: "Not recorded", time: "Not recorded" };
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) return { date: "Not recorded", time: "Not recorded" };
  return { date: dateFormatter.format(parsed), time: timeFormatter.format(parsed) };
}

export function displayDateTime(value: string | Date | null | undefined) {
  const result = displayTime(value);
  return result.date === "Not recorded" ? "Not recorded" : `${result.date}, ${result.time}`;
}
