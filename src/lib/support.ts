import crypto from "crypto";
import { Destination, SupportTicket, User } from "@/models";
import { ApiError } from "./api";
import { sendEmail } from "./notify";

export const SUPPORT_CATEGORIES = ["booking", "payment", "parking", "accessibility", "lost_property", "other"] as const;
export const supportRef = () => `SP-${Array.from(crypto.randomBytes(5)).map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("")}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export async function openTicket(i: { user?: any; name: string; email: string; category: string; subject: string; message: string; destinationId?: string; bookingRef?: string }) {
  let operator: any, destination: any;
  if (i.destinationId) { const d: any = await Destination.findById(i.destinationId).select("operator").lean(); if (!d) throw new ApiError(404, "Destination not found"); destination = d._id; operator = d.operator; }
  const t = await SupportTicket.create({ reference: supportRef(), user: i.user?._id, name: i.name, email: i.email, destination, operator, bookingRef: i.bookingRef?.toUpperCase() || undefined, category: i.category, subject: i.subject, messages: [{ from: "visitor", byName: i.name, body: i.message }] });
  return t.toObject();
}
export async function addReply(t: any, from: "visitor" | "staff", byName: string, body: string, staff?: any) {
  const set: any = { lastMessageAt: new Date(), lastFrom: from };
  if (from === "staff") { set.status = t.status === "open" ? "in_progress" : t.status; set.assignedTo = t.assignedTo || staff?._id; }
  else if (t.status === "resolved") set.status = "open"; // a visitor reply reopens a resolved ticket
  const upd = await SupportTicket.findOneAndUpdate({ _id: t._id, status: { $ne: "closed" } }, { $push: { messages: { from, byName, body, at: new Date() } }, $set: set }, { new: true }).lean();
  if (!upd) throw new ApiError(409, "This ticket is closed. Open a new one if you still need help.");
  if (from === "staff") await sendEmail({ to: t.email, subject: `Re: ${t.subject} (${t.reference})`, html: `<p>${esc(byName)} replied to your support request <strong>${esc(t.reference)}</strong>:</p><blockquote>${esc(body)}</blockquote><p>You can see the whole conversation under <em>Support</em> in your HeritageHub account.</p>` }).catch(() => {});
  return upd;
}
/** Staff and managers see tickets for their sites; tickets with no site belong to the platform admin. */
export async function visibleFilter(me: any) {
  if (me.role === "admin") return {};
  return { destination: { $in: me.assignedDestinations || [] } };
}
export async function ownerOf(userId: any) { return User.findById(userId).select("name email").lean(); }
