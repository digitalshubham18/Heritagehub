"use client";
import { useState } from "react";
import { CalendarPlus, CarFront, Download, Printer, Receipt, Send } from "lucide-react";
import { TransferDialog } from "./transfer-dialog";
import { useI18n } from "@/lib/i18n";
import { VisitInfo } from "./visit-info";
import { Button, Skeleton, StatusBadge } from "./ui";
import { HeritageArt } from "./art";
import { useApi } from "@/lib/hooks";
import { fmtDate, fmtTime, inr, todayIST } from "@/lib/utils";

function icsLink(b: any, x: any) {
  const z = (t: string) => new Date(`${b.date}T${t}:00+05:30`).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HeritageHub//EN", "BEGIN:VEVENT", `UID:${b.reference}@heritagehub`, `DTSTAMP:${z("00:00")}`, `DTSTART:${z(b.start)}`, `DTEND:${z(b.end)}`,
    `SUMMARY:Visit ${x.name}`, `LOCATION:${x.location?.address || x.city}`, `DESCRIPTION:Booking ${b.reference}. Carry a valid photo ID.`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(body);
}
export function TicketCard({ bookingId, preloaded }: { bookingId: string; preloaded?: any }) {
  const r = useApi<any>(preloaded ? null : `/api/bookings/${bookingId}`);
  const [xfer, setXfer] = useState(false);
  const { t: tr } = useI18n();
  const d = preloaded || r.data;
  if (!d) return <Skeleton className="h-72" />;
  const { booking: b, destination: x, qr } = d;
  const live = b.status === "confirmed" || b.status === "completed";
  const canTransfer = b.status === "confirmed" && (!b.channel || b.channel === "online") && !(b.checkedInCount > 0) && (b.transferCount || 0) < 2 && b.date >= todayIST();
  return (
    <article aria-label={`Ticket ${b.reference}`} className="overflow-hidden rounded-3xl border border-forest/10 bg-white shadow-lift print:shadow-none">
      <div className="relative h-32 overflow-hidden bg-forest">
        <HeritageArt slug={x.slug || "x"} type={x.type || "monument"} variant={1} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-5 text-white"><div><p className="font-display text-2xl leading-tight">{x.name}</p><p className="text-sm text-white/80">{x.city}</p></div><StatusBadge s={b.status} /></div>
      </div>
      <div className="sm:flex">
        <dl className="flex-1 space-y-3 p-5 text-sm">
          <div className="grid grid-cols-2 gap-3"><div><dt className="text-ink/60">Date</dt><dd className="font-display text-lg leading-tight">{fmtDate(b.date)}</dd></div><div><dt className="text-ink/60">Slot</dt><dd className="font-display text-lg leading-tight">{fmtTime(b.start)} to {fmtTime(b.end)}</dd></div></div>
          <div><dt className="text-ink/60">Booking reference</dt><dd className="font-mono text-xl font-semibold tracking-widest text-forest">{b.reference}</dd></div>
          <div><dt className="text-ink/60">Visitors ({b.quantity})</dt><dd>{b.visitors.map((v: any) => v.name).join(", ")}</dd></div>
          <div><dt className="text-ink/60">Tickets</dt><dd>{b.items.map((i: any) => `${i.quantity} × ${i.name}`).join("; ")}</dd></div>
          <div className="flex items-baseline justify-between border-t border-dashed border-forest/20 pt-3"><dt className="text-ink/60">Total paid</dt><dd className="font-display text-2xl">{inr(b.totalMinor)}</dd></div>
          {(b.transferCount > 0) && <div><dt className="text-ink/60">Transferred</dt><dd>{tr("tk.transferred")}</dd></div>}
          {(b.checkedInCount > 0) && <div><dt className="text-ink/60">Entry</dt><dd>{b.checkedInCount} of {b.quantity} entered{b.checkedInAt ? ` at ${new Date(b.checkedInAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</dd></div>}
        </dl>
        <div className="relative flex flex-col items-center justify-center gap-2 border-t border-dashed border-forest/25 bg-ivory-100/60 p-5 before:absolute before:-left-3 before:-top-3 before:h-6 before:w-6 before:rounded-full before:bg-ivory after:absolute after:-right-3 after:-top-3 after:h-6 after:w-6 after:rounded-full after:bg-ivory sm:w-64 sm:border-l sm:border-t-0 sm:before:-left-3 sm:before:-top-3 sm:after:-bottom-3 sm:after:-left-3 sm:after:right-auto sm:after:top-auto">
          {live && qr ? (<>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={qr} alt={`QR code for booking ${b.reference}`} className="h-44 w-44 rounded-xl border border-forest/15 bg-white p-1.5" /><p className="text-center text-xs text-ink/65">Show this QR at the entry gate with a valid photo ID</p></>)
            : <p className="max-w-[11rem] text-center text-sm text-ink/60">The QR ticket appears once the booking is confirmed.</p>}
        </div>
      </div>
      {live && qr && <div className="no-print flex flex-wrap gap-2 border-t border-forest/10 bg-white p-3">
        {b.invoiceNo && <a href={`/invoice/${b._id}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-forest/30 px-3 text-sm text-forest hover:bg-forest-50"><Receipt className="h-4 w-4" aria-hidden />Invoice</a>}
        <a href={icsLink(b, x)} download={`visit-${b.reference}.ics`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-forest/30 px-3 text-sm text-forest hover:bg-forest-50"><CalendarPlus className="h-4 w-4" aria-hidden />Add to calendar</a>
        <a href={qr} download={`ticket-${b.reference}.png`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-forest/30 px-3 text-sm text-forest hover:bg-forest-50"><Download className="h-4 w-4" aria-hidden />Download QR</a>
        {b.status === "confirmed" && b.date >= todayIST() && <a href={`/dashboard/parking?destination=${x.slug}&date=${b.date}&booking=${b.reference}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-terracotta/50 px-3 text-sm text-terracotta hover:bg-terracotta-50"><CarFront className="h-4 w-4" aria-hidden />Reserve parking</a>}
        {canTransfer && <Button size="sm" variant="outline" className="h-9" onClick={() => setXfer(true)}><Send className="h-4 w-4" aria-hidden />{tr("xf.button")}</Button>}
        <Button size="sm" variant="outline" className="h-9" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden />Print or save as PDF</Button></div>}
      {live && b.date >= todayIST() && x.location && <details className="no-print border-t border-forest/10 bg-white p-3"><summary className="cursor-pointer text-sm font-medium text-forest">{tr("vi.ticketdetails")}</summary><div className="mt-3"><VisitInfo slug={x.slug} name={x.name} to={x.location} date={b.date} compact /></div></details>}
      {canTransfer && xfer && <TransferDialog booking={b} open={xfer} onClose={() => setXfer(false)} onDone={() => r.reload()} />}
    </article>
  );
}
