import { handle, ok } from "@/lib/api";
import { issueToken } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { checkPassword } from "@/lib/login";

export const POST = handle(async (req) => {
  const { email, password } = loginSchema.parse(await req.json());
  const user = await checkPassword(req, email, password);
  return ok({ token: await issueToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role, assignedDestinations: user.assignedDestinations } });
});
export const dynamic = "force-dynamic";