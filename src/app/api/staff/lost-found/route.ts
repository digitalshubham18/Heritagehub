import { z } from "zod";
import { handle, ok, ApiError } from "@/lib/api";
import { canAccessDestination, requireUser, scopeIds } from "@/lib/auth";
import { Destination, LostFoundItem } from "@/models";
import { audit } from "@/lib/audit";
import { escapeRe } from "@/lib/utils";
import { LF_CATEGORIES, lfRef, suggestMatches } from "@/lib/lostfound";

const create = z.object({
  destinationId: z.string().min(1), kind: z.enum(["found", "lost"]), category: z.enum(LF_CATEGORIES).default("other"), description: z.string().trim().min(5, "Describe the item (at least 5 characters)").max(500),
  location: z.string().trim().max(160).optional(), color: z.string().trim().max(30).optional(), contactName: z.string().trim().max(80).optional(), contactPhone: z.string().trim().max(20).optional(),
}).refine((b) => b.kind === "found" || (b.contactName && b.contactPhone), { message: "A lost-item report needs the visitor's name and phone so we can reach them", path: ["contactPhone"] });
const patch = z.object({
  id: z.string().min(1), action: z.enum(["return", "match", "dispose", "reopen"]),
  matchId: z.string().optional(), returnedTo: z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().max(20).optional(), idType: z.enum(["aadhaar", "driving_licence", "passport", "voter_id", "pan", "other"]), idLast4: z.string().regex(/^[A-Za-z0-9]{4}$/, "Last 4 characters of the ID") }).optional(), note: z.string().trim().max(200).optional(),
});

/** Staff log found items and visitor lost-item reports for their sites; the response lists likely matches so staff can reunite them. ?q= and ?status= filter. */
export const GET = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const sp = req.nextUrl.searchParams, f: any = {};
  if (me.role === "staff") f.destination = { $in: me.assignedDestinations || [] }; else { const sc = scopeIds(me); if (sc) f.destination = { $in: sc }; }
  if (sp.get("destination")) { if (!canAccessDestination(me, sp.get("destination"))) throw new ApiError(403, "Not assigned to this destination"); f.destination = sp.get("destination"); }
  const st = sp.get("status") || "open"; if (st !== "all") f.status = st === "open" ? { $in: ["open", "matched"] } : st;
  const q = (sp.get("q") || "").trim();
  if (q) { const re = new RegExp(escapeRe(q), "i"); f.$or = [{ description: re }, { reference: q.toUpperCase() }, { location: re }, { contactName: re }, { contactPhone: re }]; }
  const items: any[] = await LostFoundItem.find(f).sort({ createdAt: -1 }).limit(150).populate("destination", "name").lean();
  const withMatches = await Promise.all(items.slice(0, 40).map(async (i) => i.status === "open" ? { ...i, suggestions: (await suggestMatches({ ...i, destination: i.destination?._id || i.destination })).map((m) => ({ id: m.item._id, reference: m.item.reference, description: m.item.description, score: m.score })) } : i));
  return ok({ items: [...withMatches, ...items.slice(40)] });
});

export const POST = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const b = create.parse(await req.json());
  if (!canAccessDestination(me, b.destinationId)) throw new ApiError(403, "Not assigned to this destination");
  const d: any = await Destination.findById(b.destinationId).select("operator").lean();
  if (!d) throw new ApiError(404, "Destination not found");
  const item = await LostFoundItem.create({ reference: lfRef(), destination: b.destinationId, operator: d.operator, kind: b.kind, category: b.category, description: b.description, location: b.location, color: b.color, contactName: b.contactName, contactPhone: b.contactPhone, loggedBy: me._id, loggedByName: me.name, history: [{ event: "logged", by: me.name }] });
  return ok({ item, suggestions: (await suggestMatches(item.toObject())).map((m) => ({ id: m.item._id, reference: m.item.reference, description: m.item.description, kind: m.item.kind, score: m.score })) }, 201);
});

export const PATCH = handle(async (req) => {
  const me = await requireUser(["staff", "admin", "operator"]);
  const b = patch.parse(await req.json());
  const item: any = await LostFoundItem.findById(b.id).lean();
  if (!item || !canAccessDestination(me, item.destination)) throw new ApiError(404, "Item not found");
  const ev = (event: string, note?: string) => ({ at: new Date(), event, by: me.name, note });
  if (b.action === "return") {
    if (item.kind !== "found") throw new ApiError(400, "Only found items are handed back");
    if (!b.returnedTo) throw new ApiError(400, "Record who collected it and the last 4 characters of the ID you checked");
    const upd = await LostFoundItem.findOneAndUpdate({ _id: item._id, status: { $in: ["open", "matched"] } }, { status: "returned", returnedTo: { ...b.returnedTo, at: new Date(), by: me._id, byName: me.name }, $push: { history: ev("returned", `To ${b.returnedTo.name}, ${b.returnedTo.idType} ending ${b.returnedTo.idLast4}`) } }, { new: true }).lean();
    if (!upd) throw new ApiError(409, "This item was just handed back or closed");
    if (item.matchedWith) await LostFoundItem.updateOne({ _id: item.matchedWith, status: { $ne: "returned" } }, { status: "returned", $push: { history: ev("returned", `Reunited with ${item.reference}`) } });
    await audit(me, "lostfound.return", "LostFoundItem", item._id, `Returned ${item.reference} to ${b.returnedTo.name}`);
    return ok({ item: upd });
  }
  if (b.action === "match") {
    const other: any = b.matchId ? await LostFoundItem.findById(b.matchId).lean() : null;
    if (!other || String(other.destination) !== String(item.destination) || other.kind === item.kind) throw new ApiError(400, "Pick one found item and one lost report from the same site");
    await LostFoundItem.updateOne({ _id: other._id }, { status: "matched", matchedWith: item._id, $push: { history: ev("matched", `With ${item.reference}`) } });
    return ok({ item: await LostFoundItem.findOneAndUpdate({ _id: item._id }, { status: "matched", matchedWith: other._id, $push: { history: ev("matched", `With ${other.reference}`) } }, { new: true }).lean() });
  }
  if (b.action === "dispose") {
    if ((b.note || "").length < 3) throw new ApiError(400, "Say how it was disposed of (e.g. handed to police, donated)");
    return ok({ item: await LostFoundItem.findOneAndUpdate({ _id: item._id, status: { $in: ["open", "matched"] } }, { status: "disposed", $push: { history: ev("disposed", b.note) } }, { new: true }).lean() });
  }
  return ok({ item: await LostFoundItem.findOneAndUpdate({ _id: item._id, status: "matched" }, { status: "open", $unset: { matchedWith: 1 }, $push: { history: ev("reopened") } }, { new: true }).lean() });
});
export const dynamic = "force-dynamic";
