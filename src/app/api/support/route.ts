import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser, scopeIds } from "@/lib/auth";
import { SupportTicket } from "@/models";
import { attachSla } from "@/lib/sla";
import { addReply, openTicket, SUPPORT_CATEGORIES, visibleFilter } from "@/lib/support";
import { limit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

/** Visitors: their own support history. Staff and managers: tickets for their sites (?status=open|in_progress|resolved|closed|all). */
export const GET = handle(async (req) => {
  const me = await requireUser();
  const sp = req.nextUrl.searchParams, id = sp.get("id");
  const mine = me.role === "tourist" || sp.get("mine") === "1"; // managers and staff can also have tickets of their own (?mine=1); without it they get their sites' inbox
  const f: any = mine ? { user: me._id } : await visibleFilter(me);
  if (!mine && me.role === "operator") { const sc = scopeIds(me); f.destination = sc ? { $in: sc } : f.destination; }
  if (id) { const t = await SupportTicket.findOne({ _id: id, $or: [{ user: me._id }, ...(mine ? [] : [f])] }).populate("destination", "name").lean(); if (!t) throw new ApiError(404, "Ticket not found"); return ok({ ticket: t }); }
  const st = sp.get("status") || "all"; if (st !== "all") f.status = st;
  const items: any[] = await SupportTicket.find(f).sort({ lastMessageAt: -1 }).limit(100).select("-messages").populate("destination", "name").lean();
  return ok({ items: mine ? items : await attachSla(items) }); // staff and managers also see which tickets are past their reply target
});

const create = z.object({ category: z.enum(SUPPORT_CATEGORIES).default("other"), subject: z.string().trim().min(4).max(140), message: z.string().trim().min(10, "Tell us a little more (at least 10 characters)").max(2000), destinationId: z.string().optional(), bookingRef: z.string().trim().max(24).optional() });
export const POST = handle(async (req) => {
  const me = await requireUser();
  await limit("support", [String(me._id)], 10, 3600);
  const b = create.parse(await req.json());
  return ok({ ticket: await openTicket({ user: me, name: me.name, email: me.email, ...b }) }, 201);
});

const reply = z.object({ id: z.string().min(1), body: z.string().trim().min(2).max(2000).optional(), status: z.enum(["in_progress", "resolved", "closed"]).optional() });
/** Visitors reply on their own ticket. Staff and managers reply and change status on tickets for their sites. */
export const PATCH = handle(async (req) => {
  const me = await requireUser();
  const b = reply.parse(await req.json());
  const t: any = await SupportTicket.findById(b.id).lean();
  if (!t) throw new ApiError(404, "Ticket not found");
  const mine = !!t.user && String(t.user) === String(me._id); // the ticket's own visitor, whatever their role
  if (!mine && (me.role === "tourist" || me.role === "staff" && (!t.destination || !canAccessDestination(me, t.destination)) || me.role === "operator" && (!t.destination || !canAccessDestination(me, t.destination)))) throw new ApiError(404, "Ticket not found");
  if (mine && b.status && b.status !== "closed") throw new ApiError(403, "You can close your own ticket, not resolve it");
  let cur = t;
  if (b.body) cur = await addReply(t, mine ? "visitor" : "staff", me.name, b.body, me);
  if (b.status) {
    const upd = await SupportTicket.findOneAndUpdate({ _id: t._id }, { status: b.status }, { new: true }).lean();
    if (!mine) await audit(me, "support." + b.status, "SupportTicket", t._id, `Support ${t.reference} marked ${b.status}`);
    cur = upd;
  }
  if (!b.body && !b.status) throw new ApiError(400, "Write a reply or choose a status");
  return ok({ ticket: cur });
});
export const dynamic = "force-dynamic";
