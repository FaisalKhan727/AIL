import { TwilioSmsAdapter } from "./twilio-adapter";
import type { SmsAdapter } from "./types";

let cached: SmsAdapter | null = null;

export function getSmsAdapter(): SmsAdapter {
  if (cached) return cached;
  cached = new TwilioSmsAdapter();
  return cached;
}

export function resetSmsAdapterForTests() {
  cached = null;
}

export type { SmsAdapter } from "./types";
