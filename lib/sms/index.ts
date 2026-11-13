import { TwilioSmsAdapter } from "./twilio-adapter";
import { MockSmsAdapter } from "./mock-adapter";
import type { SmsAdapter } from "./types";

let cached: SmsAdapter | null = null;

export function getSmsAdapter(): SmsAdapter {
  if (cached) return cached;
  // SMS_MODE=mock is for local development only; production always goes
  // through Twilio and fails loudly when it isn't configured.
  cached = process.env.SMS_MODE === "mock" ? new MockSmsAdapter() : new TwilioSmsAdapter();
  return cached;
}

export function resetSmsAdapterForTests() {
  cached = null;
}

export type { SmsAdapter } from "./types";
