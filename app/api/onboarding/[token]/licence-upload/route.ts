import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { hashOnboardingToken } from "@/lib/onboarding/token";

/**
 * POST /api/onboarding/[token]/licence-upload
 *
 * Token-authenticated (the same URL token from /start). Accepts
 * multipart/form-data:
 *   - file: image/jpeg or image/png, <= 4MB after client-side compression
 *   - which: "front" | "back"
 *
 * Stores the file in Vercel Blob under
 *   `onboarding/<sessionId>/licence-<which>-<timestamp>.<ext>`
 * and returns the unguessable Blob URL. The client persists this URL
 * via /step/5 alongside licence number, class, and expiry.
 *
 * Photos are stored with `access: "public"` because Vercel Blob URLs
 * are random hashes and effectively private-by-obscurity. We're not
 * exposing them through any /api endpoint; only the admin view panel
 * (auth-gated server-side) renders the URL into an <img>. This matches
 * the security model used by Stripe receipts, Notion attachments, etc.
 * If we ever need strict ACL we can switch to signed download URLs.
 */
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const tokenHash = hashOnboardingToken(params.token);

  const session = await prisma.onboardingSession.findUnique({
    where: { tokenHash },
    select: { id: true, status: true, tokenExpiresAt: true },
  });
  if (!session) return NextResponse.json({ error: "Invalid onboarding link" }, { status: 404 });
  if (session.status === "COMPLETED") {
    return NextResponse.json({ error: "Already completed" }, { status: 410 });
  }
  if (session.tokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form" }, { status: 400 });
  }

  const which = form.get("which");
  if (which !== "front" && which !== "back") {
    return NextResponse.json({ error: 'which must be "front" or "back"' }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "file is empty" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `file too large (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB)` },
      { status: 413 },
    );
  }
  if (!ALLOWED_MIMES.includes(file.type as (typeof ALLOWED_MIMES)[number])) {
    return NextResponse.json(
      { error: `unsupported file type "${file.type}" — use JPEG, PNG, or WebP` },
      { status: 415 },
    );
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Server storage misconfigured: BLOB_READ_WRITE_TOKEN missing" },
      { status: 500 },
    );
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  // Use a fixed pathname per (session, side) so re-upload overwrites
  // the previous file. addRandomSuffix:true ensures a fresh unguessable
  // URL each time (the old URL keeps working until manually deleted, but
  // our pointer in OnboardingData moves to the new one).
  const pathname = `onboarding/${session.id}/licence-${which}.${ext}`;

  try {
    const blob = await put(pathname, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: true,
    });
    return NextResponse.json({ ok: true, url: blob.url, which });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? `Upload failed: ${e.message}` : "Upload failed" },
      { status: 500 },
    );
  }
}
