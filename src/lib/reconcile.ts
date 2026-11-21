import { Booking, Destination, ParkingPass, ParkingTicket, Payment, User } from "@/models";
import { ApiError } from "./api";

/**
 * UPI reconciliation. Staff TELL the app a UPI payment arrived (the app cannot see the bank). This compares those claims with the credits on a bank
 * statement the manager uploads, so a payment confirmed by mistake (or without the money arriving) shows up.
 * Matching, strongest first: the UPI reference staff typed -> the ticket/booking reference carried in the UPI QR (it ends up in many banks' narrations)
 * -> same amount on the same day or the next (weak: it cannot tell WHICH of two equal payments is the missing one).
 */
export type Recorded = { source: "counter_sale" | "parking_exit" | "parking_prepaid" | "parking_pass"; ref: string; amountMinor: number; at: Date; staffId?: string; staffName: string; destinationId: string; destinationName: string; upiRef?: string };
export type BankRow = { date: string; time?: string; description: string; ref: string; amountMinor: number };
export type Item = { kind: "matched" | "amount_mismatch" | "unmatched_recorded" | "unmatched_bank"; source?: string; ref?: string; amountMinor: number; at?: Date; staffName?: string; destinationName?: string; bankLine?: string; bankDate?: string; match?: string };

/* ---------------------------- statement parsing ---------------------------- */
function splitCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  const sep = (text.split("\n", 1)[0].match(/;/g)?.length || 0) > (text.split("\n", 1)[0].match(/,/g)?.length || 0) ? ";" : (text.split("\n", 1)[0].includes("\t") ? "\t" : ",");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); if (row.some((x) => x.trim())) rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** Indian bank statements use day-first dates. Returns YYYY-MM-DD and an optional HH:MM. */
export function parseBankDate(raw: string): { date: string; time?: string } | null {
  const s = String(raw || "").trim(); if (!s) return null;
  const time = s.match(/(\d{1,2}):(\d{2})/); const t = time ? `${time[1].padStart(2, "0")}:${time[2]}` : undefined;
  let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/); if (m) return ok(+m[1], +m[2], +m[3], t);
  m = s.match(/(\d{1,2})[-/. ]([A-Za-z]{3})[a-z]*[-/. ,]*(\d{2,4})/); if (m && MONTHS[m[2].toLowerCase()]) return ok(yr(+m[3]), MONTHS[m[2].toLowerCase()], +m[1], t);
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/); if (m) return ok(yr(+m[3]), +m[2], +m[1], t);
  return null;
  function yr(y: number) { return y < 100 ? 2000 + y : y; }
  function ok(y: number, mo: number, d: number, tm?: string) { if (mo < 1 || mo > 12 || d < 1 || d > 31) return null; return { date: `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`, time: tm }; }
}
/** "1,234.50", "₹ 1234.5", "1,234.50 Cr" -> minor units; null when there is no number. */
export function parseAmountMinor(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/[₹,\s]|INR|Rs\.?/gi, "").replace(/(Cr|Dr)\.?$/i, "");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}
const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Reads a bank statement CSV (HDFC, SBI, ICICI, Axis, Kotak and similar exports) and returns the money-in rows. Throws a 400 saying what it could not find. */
export function parseStatement(text: string): { credits: BankRow[]; rowsRead: number; skipped: number } {
  const rows = splitCsv(text.replace(/^\uFEFF/, ""));
  const hi = rows.findIndex((r) => { const h = r.map(norm); return h.some((x) => x.includes("date")) && h.some((x) => /narration|description|particulars|remarks|details/.test(x)); });
  if (hi < 0) throw new ApiError(400, "Couldn't find the column headings. The statement needs a Date column and a Narration (or Description) column. Export it from net banking as CSV.");
  const head = rows[hi].map(norm);
  const col = (re: RegExp, avoid?: RegExp) => head.findIndex((h) => re.test(h) && !(avoid && avoid.test(h)));
  const iDate = (() => { const t = col(/^(txn|transaction|tran|posting)?date$|^date$/); return t >= 0 ? t : col(/date/, /value/); })();
  const iDesc = col(/narration|description|particulars|remarks|details/);
  const iRef = col(/chq|ref|utr|instrument/);
  const iCr = col(/deposit|credit|cramount|amountcr|receipt|moneyin/);
  const iDr = col(/withdraw|debit|dramount|amountdr|moneyout/);
  const iAmt = col(/^amount/); const iType = col(/^(drcr|crdr|type|txntype|transactiontype|cr\/dr)$/);
  if (iDate < 0 || iDesc < 0 || (iCr < 0 && !(iAmt >= 0 && iType >= 0))) throw new ApiError(400, "Couldn't find a money-in column. Look for a 'Deposit' / 'Credit' column, or an 'Amount' column with a Dr/Cr column.");
  const credits: BankRow[] = []; let skipped = 0, read = 0;
  for (const r of rows.slice(hi + 1)) {
    const d = parseBankDate(r[iDate] || ""); if (!d) { skipped++; continue; } read++;
    let amt: number | null = null;
    if (iCr >= 0) { amt = parseAmountMinor(r[iCr]); if ((amt == null || amt === 0) && iDr >= 0) amt = null; }
    else { const a = parseAmountMinor(r[iAmt]); const ty = String(r[iType] || r[iAmt] || "").toLowerCase(); amt = a != null && (/cr/.test(ty)) && !/dr/.test(ty) ? Math.abs(a) : null; }
    if (amt == null || amt <= 0) continue; // debits and blank rows
    credits.push({ date: d.date, time: d.time, description: String(r[iDesc] || "").trim().slice(0, 200), ref: iRef >= 0 ? String(r[iRef] || "").trim() : "", amountMinor: amt });
  }
  return { credits, rowsRead: read, skipped };
}

/* -------------------------------- matching -------------------------------- */
const alnum = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const istDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
const addDay = (date: string, n: number) => new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

export function reconcile(recorded: Recorded[], bank: BankRow[]) {
  const used = new Set<number>(); const items: Item[] = []; const done = new Set<number>();
  const text = bank.map((b) => alnum(`${b.description} ${b.ref}`));
  const mk = (r: Recorded, kind: Item["kind"], match: string, b?: BankRow): Item => ({ kind, source: r.source, ref: r.ref, amountMinor: r.amountMinor, at: r.at, staffName: r.staffName, destinationName: r.destinationName, bankLine: b ? `${b.description}`.slice(0, 120) : undefined, bankDate: b?.date, match });
  // 1 + 2: by reference (the UPI ref staff typed, then the reference carried in the QR)
  recorded.forEach((r, ri) => {
    const keys = [[alnum(r.upiRef || ""), 8, "UPI reference"], [alnum(r.ref), 6, "ticket reference in the payment note"]] as const;
    for (const [k, min, label] of keys) {
      if (!k || k.length < min) continue;
      const bi = text.findIndex((t, i) => !used.has(i) && t.includes(k));
      if (bi < 0) continue;
      used.add(bi); done.add(ri);
      items.push(bank[bi].amountMinor === r.amountMinor ? mk(r, "matched", label, bank[bi]) : mk(r, "amount_mismatch", `${label} found, but the bank shows ${(bank[bi].amountMinor / 100).toFixed(2)}`, bank[bi]));
      return;
    }
  });
  // 3: same amount, same day or the next. Oldest recorded payment first, earliest unused credit first.
  [...recorded.keys()].filter((i) => !done.has(i)).sort((a, b) => +recorded[a].at - +recorded[b].at).forEach((ri) => {
    const r = recorded[ri], d = istDate(r.at), lo = d, hi = addDay(d, 1);
    const cand = bank.map((b, i) => ({ b, i })).filter(({ b, i }) => !used.has(i) && b.amountMinor === r.amountMinor && b.date >= lo && b.date <= hi).sort((x, y) => (x.b.date + (x.b.time || "")).localeCompare(y.b.date + (y.b.time || "")))[0];
    if (cand) { used.add(cand.i); done.add(ri); items.push(mk(r, "matched", "same amount and day (weak)", cand.b)); }
  });
  recorded.forEach((r, ri) => { if (!done.has(ri)) items.push(mk(r, "unmatched_recorded", "No matching credit on the statement")); });
  bank.forEach((b, i) => { if (!used.has(i)) items.push({ kind: "unmatched_bank", amountMinor: b.amountMinor, bankLine: b.description.slice(0, 120), bankDate: b.date, match: "Money received that no gate payment accounts for" }); });
  const sum = (k: Item["kind"]) => items.filter((x) => x.kind === k).reduce((a, x) => a + x.amountMinor, 0), cnt = (k: Item["kind"]) => items.filter((x) => x.kind === k).length;
  const byStaff: Record<string, { staffName: string; recorded: number; unmatched: number; unmatchedMinor: number }> = {};
  for (const r of recorded) (byStaff[r.staffId || r.staffName] ||= { staffName: r.staffName, recorded: 0, unmatched: 0, unmatchedMinor: 0 }).recorded++;
  for (const it of items.filter((x) => x.kind === "unmatched_recorded" || x.kind === "amount_mismatch")) { const r = recorded.find((x) => x.ref === it.ref && x.staffName === it.staffName)!; const s = byStaff[r.staffId || r.staffName]; s.unmatched++; s.unmatchedMinor += it.amountMinor; }
  const totals = { recorded: recorded.length, recordedMinor: recorded.reduce((a, r) => a + r.amountMinor, 0), matched: cnt("matched"), matchedWeak: items.filter((x) => x.kind === "matched" && /weak/.test(x.match || "")).length, matchedMinor: sum("matched"), mismatch: cnt("amount_mismatch"), unmatchedRecorded: cnt("unmatched_recorded"), unmatchedRecordedMinor: sum("unmatched_recorded"), unmatchedBank: cnt("unmatched_bank"), unmatchedBankMinor: sum("unmatched_bank"), bankCredits: bank.length, byStaff: Object.values(byStaff).filter((s) => s.unmatched > 0).sort((a, b) => b.unmatchedMinor - a.unmatchedMinor) };
  return { items, totals };
}

/* ------------------------- what staff recorded as UPI ------------------------- */
export async function recordedUpi(destIds: string[], from: string, to: string): Promise<Recorded[]> {
  const start = new Date(`${from}T00:00:00+05:30`), end = new Date(`${to}T23:59:59.999+05:30`);
  const dests = new Map(((await Destination.find({ _id: { $in: destIds } }).select("name").lean()) as any[]).map((d) => [String(d._id), d.name as string]));
  const out: Recorded[] = [];
  const pays: any[] = await Payment.find({ provider: "counter", type: "charge", method: "upi", status: "succeeded", createdAt: { $gte: start, $lte: end }, amountMinor: { $gt: 0 } }).lean();
  const bookings = new Map(((await Booking.find({ _id: { $in: pays.map((p) => p.booking) }, destination: { $in: destIds } }).select("reference destination soldBy").lean()) as any[]).map((b) => [String(b._id), b]));
  const tickets: any[] = await ParkingTicket.find({ destination: { $in: destIds }, $or: [{ method: "upi", paidMinor: { $gt: 0 }, exitAt: { $gte: start, $lte: end } }, { source: "counter", prepaidMethod: "upi", prepaidMinor: { $gt: 0 }, entryAt: { $gte: start, $lte: end } }] }).lean();
  const passes: any[] = await ParkingPass.find({ destination: { $in: destIds }, channel: "staff", method: "upi", priceMinor: { $gt: 0 }, createdAt: { $gte: start, $lte: end } }).lean();
  const staffIds = new Set<string>();
  pays.forEach((p) => { const b = bookings.get(String(p.booking)); if (b) staffIds.add(String(b.soldBy || p.user)); });
  tickets.forEach((t) => { if (t.exitBy) staffIds.add(String(t.exitBy)); if (t.by) staffIds.add(String(t.by)); }); passes.forEach((p) => p.soldBy && staffIds.add(String(p.soldBy)));
  const staff = new Map(((await User.find({ _id: { $in: [...staffIds] } }).select("name").lean()) as any[]).map((u) => [String(u._id), u.name as string]));
  for (const p of pays) { const b = bookings.get(String(p.booking)); if (!b) continue; const sid = String(b.soldBy || p.user); out.push({ source: "counter_sale", ref: b.reference, amountMinor: p.amountMinor, at: p.createdAt, staffId: sid, staffName: staff.get(sid) || "Unknown", destinationId: String(b.destination), destinationName: dests.get(String(b.destination)) || "", upiRef: p.details?.upiRef }); }
  for (const t of tickets) {
    const dn = dests.get(String(t.destination)) || "";
    if (t.method === "upi" && t.paidMinor > 0 && t.exitAt && t.exitAt >= start && t.exitAt <= end) out.push({ source: "parking_exit", ref: t.ticketNo, amountMinor: t.paidMinor, at: t.exitAt, staffId: String(t.exitBy || ""), staffName: staff.get(String(t.exitBy)) || "Unknown", destinationId: String(t.destination), destinationName: dn, upiRef: t.payment?.upiRef });
    if (t.source === "counter" && t.prepaidMethod === "upi" && t.prepaidMinor > 0 && t.entryAt >= start && t.entryAt <= end) out.push({ source: "parking_prepaid", ref: `${t.ticketNo}`, amountMinor: t.prepaidMinor, at: t.entryAt, staffId: String(t.by || ""), staffName: staff.get(String(t.by)) || "Unknown", destinationId: String(t.destination), destinationName: dn });
  }
  for (const p of passes) out.push({ source: "parking_pass", ref: p.reference, amountMinor: p.priceMinor, at: p.createdAt, staffId: String(p.soldBy || ""), staffName: staff.get(String(p.soldBy)) || "Unknown", destinationId: String(p.destination), destinationName: dests.get(String(p.destination)) || "", upiRef: p.payment?.upiRef });
  return out.sort((a, b) => +a.at - +b.at);
}
