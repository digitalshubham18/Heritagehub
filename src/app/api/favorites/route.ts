import { handle, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { Destination, User } from "@/models";

export const GET = handle(async () => {
  const me = await requireUser();
  const items = await Destination.find({ _id: { $in: me.favorites || [] }, active: true }).select("slug name city images rating").lean();
  return ok({ items });
});
/** Toggles a favourite. */
export const POST = handle(async (req) => {
  const me = await requireUser();
  const { destinationId } = await req.json();
  const has = (me.favorites || []).some((f: any) => String(f) === destinationId);
  await User.updateOne({ _id: me._id }, has ? { $pull: { favorites: destinationId } } : { $addToSet: { favorites: destinationId } });
  return ok({ favorite: !has });
});

export const dynamic = "force-dynamic";
