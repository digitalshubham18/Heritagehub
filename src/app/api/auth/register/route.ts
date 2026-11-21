import bcrypt from "bcryptjs";
import { handle, ok, ApiError } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { registerSchema } from "@/lib/validators";
import { clientIp, limit } from "@/lib/ratelimit";
import { User } from "@/models";

export const POST = handle(async (req) => {
  await limit("register", [clientIp(req)], 8, 3600);
  const body = registerSchema.parse(await req.json());
  if (await User.exists({ email: body.email })) throw new ApiError(409, "An account with this email already exists");
  const user = await User.create({ ...body, passwordHash: await bcrypt.hash(body.password, 10), role: "tourist" });
  await createSession(user);
  return ok({ user: { id: user._id, name: user.name, role: user.role } }, 201);
});

export const dynamic = "force-dynamic";
