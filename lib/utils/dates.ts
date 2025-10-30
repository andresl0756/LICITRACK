import { format, sub } from "date-fns";

const DATE_FORMAT = "yyyy-MM-dd";

/**
 * Devuelve la fecha de hoy en formato YYYY-MM-DD
 */
export function getTodayFormatted(): string {
  return format(new Date(), DATE_FORMAT);
}

/**
 * Devuelve la fecha de hace 30 días en formato YYYY-MM-DD
 */
export function get30DaysAgoFormatted(): string {
  const today = new Date();
  const thirtyDaysAgo = sub(today, { days: 30 });
  return format(thirtyDaysAgo, DATE_FORMAT);
}