import webpush from "web-push";

let initialised = false;

function init() {
  if (initialised) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID env vars missing: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT must all be set",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialised = true;
}

export function getWebPush() {
  init();
  return webpush;
}

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
