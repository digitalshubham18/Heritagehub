import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { User } from "@/models";
import { ApiError } from "./api";
import { clearLimit, clientIp, limit } from "./ratelimit";

/** Password step shared by web and mobile sign-in: same rate limits, same message for unknown email and wrong password. */
export async function checkPassword(req: NextRequest, email: string, password: string) {
  const ip = clientIp(req);
  await limit("login-ip", [ip], 40, 900);
  await limit("login-acct", [`${ip}:${email}`], 6, 900);
  const user = await User.findOne({ email }).select("+passwordHash");
  const valid = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) throw new ApiError(401, "Incorrect email or password");
  await clearLimit("login-acct", `${ip}:${email}`);
  return user;
}

/** Second step. Wrong codes are limited per account (not per IP), so spreading guesses across addresses does not help. */
export async function requireSecondFactor(user: any, code: string) {
  await limit("2fa", [String(user._id)], 8, 900);
  await clearLimit("2fa", String(user._id));
}
