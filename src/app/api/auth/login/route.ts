import { handle, ok } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { checkPassword } from "@/lib/login";

export const POST = handle(async (req) => {
  const { email, password } = loginSchema.parse(await req.json());
  const user = await checkPassword(req, email, password);
  await createSession(user);
  return ok({ user: { id: user._id, name: user.name, role: user.role } });
});
export const dynamic = "force-dynamic";