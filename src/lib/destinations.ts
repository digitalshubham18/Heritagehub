import { Types } from "mongoose";
import { Destination, TicketCategory } from "@/models";
import { ApiError } from "./api";

export async function loadDestination(idOrSlug: string, includeInactive = false) {
  const q: any = Types.ObjectId.isValid(idOrSlug) ? { $or: [{ _id: idOrSlug }, { slug: idOrSlug }] } : { slug: idOrSlug };
  if (!includeInactive) q.active = true;
  const d: any = await Destination.findOne(q).lean();
  if (!d) throw new ApiError(404, "Destination not found");
  return d;
}

/** Upserts submitted categories; categories missing from the payload are deactivated (never deleted: bookings snapshot them). */
export async function syncCategories(destId: any, cats: any[]) {
  const keep: string[] = [];
  for (let i = 0; i < cats.length; i++) {
    const { _id, ...c } = cats[i];
    if (_id && Types.ObjectId.isValid(_id)) { await TicketCategory.updateOne({ _id, destination: destId }, { ...c, active: true, sortOrder: i }); keep.push(_id); }
    else { const n = await TicketCategory.create({ ...c, destination: destId, sortOrder: i }); keep.push(String(n._id)); }
  }
  await TicketCategory.updateMany({ destination: destId, _id: { $nin: keep } }, { active: false });
}
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
