import { NextResponse } from "next/server";
import { handle, ApiError } from "@/lib/api";
import { canAccessDestination, currentUser } from "@/lib/auth";
import { requireDevice } from "@/lib/devices";
import { Booking, Destination } from "@/models";
import { fmtDate, fmtTime, inr } from "@/lib/utils";
import { ticketCode } from "@/lib/booking";

const W = 42;
const center = (s: string) => " ".repeat(Math.max(0, Math.floor((W - s.length) / 2))) + s;
const row = (a: string, b: string) => a + " ".repeat(Math.max(1, W - a.length - b.length)) + b;

/**
 * Thermal-printer receipt for a booking. `?format=text` (default) is plain 42-column text; `?format=escpos` returns
 * base64 ESC/POS bytes (init, centred header, bold total, partial cut) ready to write to an 80 mm printer.
 * Auth: `X-Device-Key` (a printer device for that destination) or a staff/admin/operator session.
 */
export const GET = handle(async (req, { params }) => {
  let allowedDest: string | null = null;
  if (req.headers.get("x-device-key")) allowedDest = String((await requireDevice(req)).destination);
  else { const me = await currentUser(); if (!me || me.role === "tourist") throw new ApiError(401, "Sign in as staff or use a device key"); }
  const b: any = await Booking.findOne({ $or: [{ _id: /^[a-f\d]{24}$/i.test(params.id) ? params.id : undefined }, { reference: String(params.id).toUpperCase() }] }).lean();
  if (!b || b.status === "pending") throw new ApiError(404, "Booking not found");
  if (allowedDest && String(b.destination) !== allowedDest) throw new ApiError(403, "This device is not for that destination");
  if (!allowedDest) { const me = await currentUser(); if (!canAccessDestination(me, b.destination)) throw new ApiError(403, "Not assigned to this destination"); }
  const d: any = await Destination.findById(b.destination).select("name city").lean();
  const lines = [center(d.name.toUpperCase()), center(d.city), "-".repeat(W), row("Date", fmtDate(b.date)), row("Slot", `${fmtTime(b.start)} to ${fmtTime(b.end)}`), row("Ref", b.reference), row("Invoice", b.invoiceNo || "-"), "-".repeat(W),
    ...b.items.map((i: any) => row(`${i.quantity} x ${i.name}`.slice(0, 30), inr((i.unitPriceMinor + i.unitFeeMinor) * i.quantity))),
    ...(b.discountMinor ? [row("Group concession", "-" + inr(b.discountMinor))] : []), ...(b.feesMinor ? [row("Convenience fee", inr(b.feesMinor)), row("GST on fee", inr(b.taxMinor))] : []),
    "-".repeat(W), row("TOTAL", inr(b.totalMinor)), "", center(b.channel === "counter" ? "Paid at counter" : "Paid online"), center(`QR: ${ticketCode(b.reference)}`.slice(0, W)), "", center("Keep this receipt for entry")];
  const fmt = req.nextUrl.searchParams.get("format") || "text";
  if (fmt === "escpos") {
    const ESC = 0x1b, GS = 0x1d, enc = (s: string) => Buffer.from(s + "\n", "ascii");
    const bytes = Buffer.concat([Buffer.from([ESC, 0x40]), Buffer.from([ESC, 0x61, 0x01, ESC, 0x45, 0x01]), enc(d.name.toUpperCase()), Buffer.from([ESC, 0x45, 0x00, ESC, 0x61, 0x00]), ...lines.slice(1).map((l) => enc(l.replace(/[^\x20-\x7e]/g, "?"))), Buffer.from("\n\n\n"), Buffer.from([GS, 0x56, 0x42, 0x00])]);
    return NextResponse.json({ format: "escpos", encoding: "base64", data: bytes.toString("base64"), columns: W });
  }
  return new NextResponse(lines.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
});
export const dynamic = "force-dynamic";
