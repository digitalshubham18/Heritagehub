"use client";
import Link from "next/link";
import { toast } from "sonner";
import { api, useApi } from "@/lib/hooks";
import { Badge, Button, Card, Empty, ErrorState, PageSkeleton, useConfirm } from "@/components/ui";
import { fmtDate, fmtTime, inr } from "@/lib/utils";

const TONE: Record<string, string> = { requested: "bg-amber-100 text-amber-900", awaiting_payment: "bg-terracotta-50 text-terracotta-600", paid: "bg-emerald-100 text-emerald-900", rejected: "bg-red-100 text-red-900", cancelled: "bg-stone-200 text-stone-800", expired: "bg-stone-200 text-stone-800", approved: "bg-sky-100 text-sky-900" };
const LABEL: Record<string, string> = { requested: "Waiting for the site", awaiting_payment: "Approved: pay to confirm", paid: "Confirmed and paid", rejected: "Not accepted", cancelled: "Cancelled", expired: "Payment window ended" };

export default function MyGroups() {
  const { data, loading, error, reload } = useApi<any>("/api/groups");
  const { confirm, dialog } = useConfirm();
  async function cancel(id: string) {
    if (!(await confirm({ title: "Cancel this group request?", body: "If seats are being held for you they will be released.", confirmLabel: "Cancel request", danger: true }))) return;
    try { await api(`/api/groups/${id}`, { method: "PATCH", body: { action: "cancel" } }); toast.success("Request cancelled"); reload(); } catch (e: any) { toast.error(e.message); }
  }
  return (
    <div className="space-y-6">{dialog}
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl">Group requests</h1><Link href="/groups" className="rounded-lg bg-forest px-4 py-2 text-sm text-ivory">New request</Link></div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : !data.items.length ? <Empty title="No group requests" action={<Link href="/groups" className="rounded-lg bg-forest px-4 py-2 text-sm text-ivory">Plan a group visit</Link>}>Schools and tour groups can request a visit for 10 or more people.</Empty> : (
        <div className="space-y-4">{data.items.map((r: any) => (
          <Card key={r._id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-display text-xl">{r.destinationInfo?.name}</p><p className="text-sm text-ink/70">{r.organisation} · {r.size} people · {fmtDate(r.date)}{r.preferredStart ? `, around ${fmtTime(r.preferredStart)}` : ""}</p></div>
            <Badge className={TONE[r.displayStatus] || "bg-stone-100"}>{LABEL[r.displayStatus] || r.displayStatus}</Badge></div>
            {r.managerNote && <p className="mt-3 rounded-lg bg-ivory-100 p-3 text-sm"><span className="text-ink/60">Note from the site: </span>{r.managerNote}</p>}
            {r.bookingInfo && <p className="mt-3 text-sm text-ink/80">Slot {fmtTime(r.bookingInfo.start)} to {fmtTime(r.bookingInfo.end)} · total {inr(r.bookingInfo.totalMinor)}{r.discountPct ? ` (includes ${r.discountPct}% concession)` : ""}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {r.displayStatus === "awaiting_payment" && <Link href={`/checkout/${r.booking}`} className="inline-flex h-9 items-center rounded-lg bg-terracotta px-4 text-sm font-medium text-white hover:bg-terracotta-600">Pay now</Link>}
              {r.displayStatus === "paid" && <Link href="/dashboard/tickets" className="inline-flex h-9 items-center rounded-lg border border-forest/30 px-4 text-sm text-forest hover:bg-forest-50">View group ticket</Link>}
              {["requested", "awaiting_payment"].includes(r.displayStatus) && <Button size="sm" variant="ghost" onClick={() => cancel(r._id)}>Cancel request</Button>}
            </div></Card>))}</div>)}
    </div>
  );
}
