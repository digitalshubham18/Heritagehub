import bcrypt from "bcryptjs";
import crypto from "crypto";
import { PasswordReset, User } from "@/models";
import { ApiError } from "./api";
import { sendEmail } from "./notify";

const APP_URL = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
export const RESET_MINUTES = 60;

/**
 * Emails a one-time reset link. Never says whether the address has an account (the caller always answers the same way).
 * Only the SHA-256 of the token is stored, so a database leak does not hand out working links.
 */
export async function requestPasswordReset(email: string) {
  const user: any = await User.findOne({ email }).select("name email active").lean();
  if (!user || !user.active) return false;
  await PasswordReset.deleteMany({ user: user._id, usedAt: { $exists: false } }); // only the newest link works
  const token = crypto.randomBytes(32).toString("base64url");
  await PasswordReset.create({ user: user._id, tokenHash: sha(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) });
  const link = `${APP_URL()}/reset-password?token=${token}`;
  await sendEmail({
    to: user.email, subject: "Reset your HeritageHub password",
    html: `<p>Hello ${esc(user.name)},</p><p>Someone asked to reset the password for this account. If that was you, choose a new one within ${RESET_MINUTES} minutes:</p><p><a href="${link}">Reset my password</a></p><p>If it wasn't you, ignore this email. Your password stays the same.</p>`,
  });
  if (process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY) console.log(`[reset:dev] ${link}`);
  return true;
}

/** Sets a new password from a reset link. The link works once; every older session for the account ends. Two-step sign-in stays on. */
export async function completePasswordReset(token: string, newPassword: string) {
  const used = await PasswordReset.findOneAndUpdate({ tokenHash: sha(token), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } }, { new: true }).lean() as any;
  if (!used) throw new ApiError(400, "This reset link is invalid or has expired. Ask for a new one.");
  const u: any = await User.findOneAndUpdate({ _id: used.user, active: true }, { $set: { passwordHash: await bcrypt.hash(newPassword, 10) }, $inc: { sessionVersion: 1 } }, { new: true }).select("name email").lean();
  if (!u) throw new ApiError(400, "This account can't be reset. Contact support.");
  await sendEmail({ to: u.email, subject: "Your HeritageHub password was changed", html: `<p>Hello ${esc(u.name)},</p><p>Your password was just changed and you were signed out everywhere. If this wasn't you, reset it again straight away and contact support.</p>` });
  return u;
}
