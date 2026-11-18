import type { DateValue } from "../definitions/types";

/** A 360-day calendar with no year zero, shared by expiry and its UI. */
export function gameDay(date: DateValue): number {
  const year = date.year > 0 ? date.year - 1 : date.year;
  return year * 360 + (date.month - 1) * 30 + date.day - 1;
}
export function dateFromGameDay(day: number): DateValue {
  const year = Math.floor(day / 360);
  const withinYear = day - year * 360;
  return {
    year: year >= 0 ? year + 1 : year,
    month: Math.floor(withinYear / 30) + 1,
    day: (withinYear % 30) + 1,
  };
}
/** Beyond the supported historical game window; still finite and serializable. */
export const PERMANENT_MODIFIER_EXPIRY = gameDay({
  year: 10000,
  month: 1,
  day: 1,
});
