import { z } from "zod";

export const weekIdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type WeekId = z.infer<typeof weekIdSchema>;

const kstDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const koreanWeekdayFormatter = new Intl.DateTimeFormat("ko-KR", {
  weekday: "short",
  timeZone: "UTC",
});

export function weekIdFromDate(date: Date): WeekId {
  return weekIdSchema.parse(kstDateFormatter.format(date));
}

export function scheduledWeekId(runAt: Date): WeekId {
  const current = weekIdFromDate(runAt);
  const [year, month, day] = current.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return current;
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  const daysUntilNextMonday = (8 - utc.getUTCDay()) % 7 || 7;
  utc.setUTCDate(utc.getUTCDate() + daysUntilNextMonday);
  return weekIdSchema.parse(utc.toISOString().slice(0, 10));
}

export function formatKoreanDate(weekId: WeekId): string {
  const [year, month, day] = weekId.split("-").map(Number);
  return `${String(year)}년 ${String(month)}월 ${String(day)}일`;
}

export function formatKoreanDateWithWeekday(weekId: WeekId): string {
  const [year, month, day] = weekId.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  const weekday = koreanWeekdayFormatter.format(date);
  return `${formatKoreanDate(weekId)} (${weekday})`;
}

export function formatWeekListLabel(weekId: WeekId): string {
  const [year, month, day] = weekId.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  const weekday = koreanWeekdayFormatter.format(date);
  return `${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")} ${weekday}`;
}
