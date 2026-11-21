import bcrypt from "bcryptjs";
import { handle, ok, ApiError } from "@/lib/api";
import { createSession, requireUser } from "@/lib/auth";
import { profileSchema } from "@/lib/validators";
import { User } from "@/models";

export const PATCH = handle(async (req) => {
  const me = await requireUser(undefined, { allowUnenrolled: true });
  const { currentPassword, newPassword, ...rest } = profileSchema.parse(await req.json());
  const update: any = { ...rest };
  if (newPassword) {
    const u = await User.findById(me._id).select("+passwordHash");
    if (!currentPassword || !(await bcrypt.compare(currentPassword, u.passwordHash))) throw new ApiError(400, "Current password is incorrect");
    update.passwordHash = await bcrypt.hash(newPassword, 10);
  }
  const changed = !!update.passwordHash;
  await User.updateOne({ _id: me._id }, changed ? { ...update, $inc: { sessionVersion: 1 } } : update);
  // A password change ends every older session (a stolen cookie or token stops working). This browser gets a fresh one.
  if (changed) { const fresh: any = await User.findById(me._id).select("role name sessionVersion"); await createSession(fresh); }
  return ok({ ok: true, signedOutElsewhere: changed });
});

export const dynamic = "force-dynamic";
