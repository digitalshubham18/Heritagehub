/**
 * Email (Resend) and SMS (Twilio) delivery. Provider-agnostic at the call site: with no API keys set
 * (or NOTIFY_DISABLED=true) messages are logged to the server console instead, so local dev just works.
 */
import QRCode from "qrcode";
import { Destination, User } from "@/models";
import { ticketCode } from "./booking";
import { fmtDate, fmtTime, inr } from "./utils";

const APP_URL = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const esc = (s: any) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const disabled = () => process.env.NOTIFY_DISABLED === "true";

export async function sendEmail(o: { to: string; subject: string; html: string; attachments?: { filename: string; content: string }[] }) {
  if (disabled()) return false;
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log(`[email:dev] to=${o.to} subject="${o.subject}"`); return false; }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || "HeritageHub <onboarding@resend.dev>", to: [o.to], subject: o.subject, html: o.html, attachments: o.attachments }),
  });
  if (!r.ok) console.error("[email] Resend error", r.status, await r.text());
  return r.ok;
}

export const normalizePhone = (p?: string) => { const d = (p || "").replace(/[^\d+]/g, ""); return d.startsWith("+") ? d : d.length === 10 ? `+91${d}` : d.length > 10 ? `+${d}` : ""; };
export async function sendSms(to: string | undefined, body: string) {
  const num = normalizePhone(to);
  if (disabled() || !num) return false;
  const sid = process.env.TWILIO_ACCOUNT_SID, token = process.env.TWILIO_AUTH_TOKEN, from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) { console.log(`[sms:dev] to=${num} "${body}"`); return false; }
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: num, From: from, Body: body }),
  });
  if (!r.ok) console.error("[sms] Twilio error", r.status, await r.text());
  return r.ok;
}

const shell = (title: string, inner: string) => `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#26261F"><h1 style="font-family:Georgia,serif;color:#1F4D3A">${esc(title)}</h1>${inner}<p style="font-size:12px;color:#777">HeritageHub prototype: sample data, simulated or test payments unless configured otherwise.</p></div>`;

export async function notifyBookingConfirmed(b: any) {
  try {
    if (!b.contact?.email) return;
    const dest: any = await Destination.findById(b.destination).select("name").lean();
    const png = await QRCode.toBuffer(ticketCode(b.reference), { margin: 1, width: 360, color: { dark: "#173B2C", light: "#FFFFFF" } });
    const html = shell("Your tickets are confirmed", `<p>${esc(dest.name)}<br><strong>${esc(fmtDate(b.date))}, ${esc(fmtTime(b.start))} to ${esc(fmtTime(b.end))}</strong></p>
      <p>Reference: <strong style="font-family:monospace;font-size:18px">${esc(b.reference)}</strong><br>${b.quantity} ticket(s), ${esc(inr(b.totalMinor))}</p>
      <p>Show the attached QR code at the gate with a valid photo ID.</p><p><a href="${APP_URL()}/dashboard/tickets">Open my tickets</a></p>`);
    await sendEmail({ to: b.contact.email, subject: `Tickets confirmed: ${dest.name}, ${b.date}`, html, attachments: [{ filename: `ticket-${b.reference}.png`, content: png.toString("base64") }] });
    await sendSms(b.contact.phone, `HeritageHub: ${dest.name} ${b.date} ${b.start}. Ref ${b.reference}. Show your QR at entry: ${APP_URL()}/dashboard/tickets`);
  } catch (e) { console.error("[notify] booking confirmed failed", e); }
}

export async function notifyCancelled(b: any, refundMinor: number) {
  try {
    if (!b.contact?.email) return;
    const dest: any = await Destination.findById(b.destination).select("name").lean();
    await sendEmail({ to: b.contact.email, subject: `Booking cancelled: ${b.reference}`, html: shell("Booking cancelled", `<p>${esc(dest.name)} on ${esc(fmtDate(b.date))} (${esc(b.reference)}) has been cancelled.</p><p>${refundMinor > 0 ? `A refund of <strong>${esc(inr(refundMinor))}</strong> has been initiated.` : "No refund applies under this site's policy."}</p>`) });
    await sendSms(b.contact.phone, `HeritageHub: booking ${b.reference} cancelled.${refundMinor > 0 ? ` Refund ${inr(refundMinor)} initiated.` : ""}`);
  } catch (e) { console.error("[notify] cancel failed", e); }
}

export async function notifyWaitlist(w: any, slot: any) {
  try {
    const [user, dest]: any[] = await Promise.all([User.findById(w.user).lean(), Destination.findById(w.destination).select("name slug").lean()]);
    if (!user || !dest) return;
    const link = `${APP_URL()}/destinations/${dest.slug}?date=${slot.date}`;
    await sendEmail({ to: user.email, subject: `Seats opened up: ${dest.name}`, html: shell("Seats are available", `<p>${w.quantity} seat(s) you wanted at <strong>${esc(dest.name)}</strong> on ${esc(fmtDate(slot.date))}, ${esc(fmtTime(slot.start))} are open again.</p><p>Seats go to whoever books first.</p><p><a href="${link}">Book now</a></p>`) });
    await sendSms(user.phone, `HeritageHub: seats opened at ${dest.name} ${slot.date} ${slot.start}. Book fast: ${link}`);
  } catch (e) { console.error("[notify] waitlist failed", e); }
}

export async function notifyPassPurchased(pass: any, user: any) {
  try {
    if (!user?.email) return;
    const { passCode } = await import("./passes");
    const png = await QRCode.toBuffer(passCode(pass.reference), { margin: 1, width: 360, color: { dark: "#173B2C", light: "#FFFFFF" } });
    await sendEmail({ to: user.email, subject: `Your season pass: ${pass.reference}`, html: shell("Your season pass is ready", `<p><strong>${esc(pass.holderName)}</strong><br>Valid ${esc(pass.validFrom)} to ${esc(pass.validTo)} at ${esc(pass.destinationNames.join(", "))}</p><p>Reference <strong style="font-family:monospace">${esc(pass.reference)}</strong>. Show the attached QR at the gate.</p><p><a href="${APP_URL()}/dashboard/passes">Open my passes</a></p>`), attachments: [{ filename: `pass-${pass.reference}.png`, content: png.toString("base64") }] });
  } catch (e) { console.error("[notify] pass failed", e); }
}

export async function notifyGroupDecision(req: any, user: any, dest: any, opts: { approved: boolean; bookingId?: string; note?: string; total?: string; holdHours?: number }) {
  try {
    if (!user?.email) return;
    const body = opts.approved
      ? `<p>Your group visit to <strong>${esc(dest.name)}</strong> on ${esc(fmtDate(req.date))} for ${req.size} people is approved.</p>${opts.total ? `<p>Total to pay: <strong>${esc(opts.total)}</strong>${req.discountPct ? ` (includes a ${req.discountPct}% concession)` : ""}.</p>` : ""}<p>Please pay within ${opts.holdHours || 48} hours to confirm: <a href="${APP_URL()}/checkout/${opts.bookingId}">Pay now</a></p>${opts.note ? `<p>Note from the site: ${esc(opts.note)}</p>` : ""}`
      : `<p>Sorry, your group request for <strong>${esc(dest.name)}</strong> on ${esc(fmtDate(req.date))} couldn't be accepted.</p>${opts.note ? `<p>${esc(opts.note)}</p>` : ""}<p>You're welcome to send a new request for another date.</p>`;
    await sendEmail({ to: user.email, subject: opts.approved ? `Group visit approved: ${dest.name}` : `Group request update: ${dest.name}`, html: shell(opts.approved ? "Group visit approved" : "Group request update", body) });
  } catch (e) { console.error("[notify] group failed", e); }
}
