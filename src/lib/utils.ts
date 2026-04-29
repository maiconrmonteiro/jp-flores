import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns today's date as YYYY-MM-DD in the LOCAL timezone (not UTC) */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Format any Date to YYYY-MM-DD in local timezone */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Next operation date: Terça e Quarta → Quinta; outros dias → próxima Terça */
export function getNextOperationDate(): string {
  const today = new Date();
  const dow = today.getDay();
  let d = 0;
  if (dow === 2) d = 2;       // Tue → Thu
  else if (dow === 3) d = 1;  // Wed → Thu
  else if (dow === 4) d = 5;  // Thu → next Tue
  else if (dow === 5) d = 4;  // Fri → next Tue
  else if (dow === 6) d = 3;  // Sat → next Tue
  else if (dow === 0) d = 2;  // Sun → next Tue
  else if (dow === 1) d = 1;  // Mon → next Tue
  const t = new Date(today);
  t.setDate(today.getDate() + d);
  return localDateStr(t);
}

/** Returns the Tuesday of the current week as YYYY-MM-DD */
export function getTuesdayOfWeek(): string {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun,1=Mon,2=Tue,...
  const diff = dow >= 2 ? dow - 2 : dow + 5; // days since last Tuesday
  const tue = new Date(today);
  tue.setDate(today.getDate() - diff);
  return localDateStr(tue);
}
