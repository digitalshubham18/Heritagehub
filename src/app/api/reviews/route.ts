import { Types } from "mongoose";
import { handle, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { reviewSchema } from "@/lib/validators";
import { limit } from "@/lib/ratelimit";
import { Destination, Review } from "@/models";

export const GET = handle(async (req) => {
  if (req.nextUrl.searchParams.get("mine") === "1") {
    const me = await requireUser();
    return ok({ items: (await Review.find({ user: me._id }).lean()).map((r: any) => ({ id: r._id, destination: String(r.destination), rating: r.rating, comment: r.comment, at: r.updatedAt })) });
  }
  const id = req.nextUrl.searchParams.get("destination");
  if (!id) throw new ApiError(400, "destination is required");
  const items = await Review.find({ destination: id }).sort({ createdAt: -1 }).limit(30).populate("user", "name").lean();
  return ok({ items: items.map((r: any) => ({ id: r._id, rating: r.rating, comment: r.comment, name: r.user?.name || "Visitor", at: r.createdAt })) });
});
export const POST = handle(async (req) => {
  const me = await requireUser(["tourist", "admin"]);
  await limit("review", [String(me._id)], 10, 3600);
  const b = reviewSchema.parse(await req.json());
  await Review.updateOne({ user: me._id, destination: b.destinationId }, { rating: b.rating, comment: b.comment }, { upsert: true });
  const [agg] = await Review.aggregate([{ $match: { destination: new Types.ObjectId(b.destinationId) } }, { $group: { _id: null, avg: { $avg: "$rating" }, n: { $sum: 1 } } }]);
  if (agg) await Destination.updateOne({ _id: b.destinationId }, { rating: Math.round(agg.avg * 10) / 10, ratingCount: agg.n });
  return ok({ ok: true });
});

export const dynamic = "force-dynamic";
