import { put } from "@vercel/blob";

/**
 * Upload a generated PDF buffer to Vercel Blob and return its URL.
 * Pathname pattern: `onboarding/<sessionId>/<kind>.pdf`. `addRandomSuffix`
 * gives every regeneration a fresh unguessable URL — the prior one keeps
 * working until manually purged, but our pointer in OnboardingData moves
 * to the new one so admins always download the latest version.
 *
 * Caller is responsible for handling the BLOB_READ_WRITE_TOKEN-missing
 * case (we throw a clear error here so the API layer can return 500).
 */
export async function uploadPdfToBlob(
  sessionId: string,
  kind: "contract" | "package",
  buffer: Buffer,
): Promise<string> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is not set");
  }
  const pathname = `onboarding/${sessionId}/${kind}.pdf`;
  const blob = await put(pathname, buffer, {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: true,
  });
  return blob.url;
}
