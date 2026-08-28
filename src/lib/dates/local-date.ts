/** Parse HTML date input (YYYY-MM-DD) as local calendar day noon — avoids UTC shift. */
export function dateInputToIso(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) throw new Error("INVALID_DATE");
  return toCalendarStoredDate(new Date(y, m - 1, d, 12, 0, 0, 0)).toISOString();
}

/** Calendar date stored at local noon — safe round-trip for date-only fields. */
export function toCalendarStoredDate(input: Date | string): Date {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error("INVALID_DATE");
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

/** End of local calendar day for inclusive range upper bounds. */
export function calendarEndOfDay(input: Date | string): Date {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) throw new Error("INVALID_DATE");
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** ISO instant → YYYY-MM-DD for `<input type="date">` in local timezone. */
export function isoToDateInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's YYYY-MM-DD in local timezone for date inputs. */
export function todayDateInput(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isoInLocalRange(
  iso: string,
  range: { from: Date; to: Date } | null
): boolean {
  if (!range) return true;
  const d = new Date(iso);
  return d >= range.from && d <= range.to;
}
