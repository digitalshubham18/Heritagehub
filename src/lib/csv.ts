import { NextResponse } from "next/server";

/**
 * CSV with spreadsheet-formula protection: a text cell that starts with = + - @ (or a tab/CR) is prefixed with an apostrophe so Excel
 * and Sheets show it as text instead of running it. Numbers are written as numbers and are never altered.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows: Record<string, unknown>[], columns?: string[]) {
  const keys = columns || (rows.length ? Object.keys(rows[0]) : []);
  if (!keys.length) return "";
  return [keys.join(","), ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(","))].join("\r\n") + "\r\n";
}
export function csvResponse(name: string, rows: Record<string, unknown>[], columns?: string[]) {
  return new NextResponse("\uFEFF" + toCsv(rows, columns), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name.replace(/[^\w.-]/g, "_")}"`, "Cache-Control": "no-store" } });
}
