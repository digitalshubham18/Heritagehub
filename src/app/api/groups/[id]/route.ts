import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { Booking, GroupRequest } from "@/models";
import { approveGroup, rejectGroup } from "@/lib/groups";
import { cancelBooking } from "@/lib/booking";
import { audit } from "@/lib/audit";

const decide = z.object({ action: z.enum(["approve", "reject", "cancel"]), slotId: z.string().optional(), start: z.string().optional(), discountPct: z.number().min(0).max(100).default(0), holdHours: z.number().int().min(1).max(168).default(48), note: z.string().max(500).optional() });

export const PATCH = handle(async (req, { params }) => {
  const me = await requireUser();
  const b = decide.parse(await req.json());
  const r: any = await GroupRequest.findById(params.id).lean();
  if (!r) throw new ApiError(404, "Request not found");
  if (b.action === "cancel") {
    if (String(r.user) !== String(me._id) && me.role !== "admin") throw new ApiError(403, "Only the requester can cancel");
    if (r.status !== "requested" && r.status !== "approved") throw new ApiError(409, `This request is already ${r.status}`);
    if (r.booking) { const bk: any = await Booking.findById(r.booking).lean(); if (bk && ["pending", "confirmed"].includes(bk.status)) await cancelBooking(bk, me, "Group request cancelled by requester", me.role === "admin"); }
    await GroupRequest.updateOne({ _id: r._id }, { status: "cancelled" });
    return ok({ ok: true });
  }
  if (me.role !== "admin" && me.role !== "operator") throw new ApiError(403, "Only site managers can decide group requests");
  if (b.action === "reject") { const upd = await rejectGroup(me, r, b.note); await audit(me, "group.reject", "GroupRequest", r._id, `Rejected group request from ${r.organisation}`); return ok({ request: upd }); }
  const res = await approveGroup(me, r, { slotId: b.slotId, start: b.start, discountPct: b.discountPct, holdHours: b.holdHours, note: b.note });
  await audit(me, "group.approve", "GroupRequest", r._id, `Approved ${r.size} for ${r.organisation} with ${b.discountPct}% concession`);
  return ok({ request: res.request, booking: res.booking });
});
export const dynamic = "force-dynamic";
