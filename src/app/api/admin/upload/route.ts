import { handle, ok, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";

const MAX_BLOB = 4 * 1024 * 1024; // Vercel serverless request body limit is ~4.5 MB
const MAX_INLINE = 600 * 1024;
/**
 * With BLOB_READ_WRITE_TOKEN set, images are uploaded to Vercel Blob (public URL). Otherwise the prototype falls
 * back to a data URI stored on the destination document (small images only).
 */
export const POST = handle(async (req) => {
  await requireUser(["admin", "operator"]);
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) throw new ApiError(400, "No file received");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new ApiError(400, "Use a JPEG, PNG or WebP image");
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    if (file.size > MAX_BLOB) throw new ApiError(400, "Image must be under 4 MB");
    const { put } = await import("@vercel/blob");
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-60);
    const blob = await put(`destinations/${Date.now()}-${safe}`, file, { access: "public", contentType: file.type });
    return ok({ url: blob.url, storage: "blob" });
  }
  if (file.size > MAX_INLINE) throw new ApiError(400, "Image must be under 600 KB (set BLOB_READ_WRITE_TOKEN to allow larger uploads)");
  const buf = Buffer.from(await file.arrayBuffer());
  return ok({ url: `data:${file.type};base64,${buf.toString("base64")}`, storage: "inline" });
});

export const dynamic = "force-dynamic";
