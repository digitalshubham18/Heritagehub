import { handle, ok } from "@/lib/api";
import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export const GET = handle(async () => {
  const u: any = await currentUser();
  return ok({ user: u ? { id: u._id, name: u.name, email: u.email, role: u.role, phone: u.phone, nationality: u.nationality, favorites: u.favorites, assignedDestinations: u.assignedDestinations, mustEnrollTwoFactor: !!u.mustEnrollTwoFactor, twoFactor: !!u.twoFactor?.enabled } : null });
});
