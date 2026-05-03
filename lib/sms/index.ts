import { MockSmsAdapter } from "./mock-adapter";
import { TwilioSmsAdapter } from "./twilio-adapter";
import type { SmsAdapter } from "./types";

let cached: SmsAdapter | null = null;

export function getSmsAdapter(): SmsAdapter {
  if (cached) return cached;
  const mode = (process.env.SMS_MODE || "mock").toLowerCase();
  const next: SmsAdapter = mode === "twilio" ? new TwilioSmsAdapter() : new MockSmsAdapter();
  cached = next;
  return next;
}

export function getSmsMode(): "mock" | "twilio" {
  return (process.env.SMS_MODE || "mock").toLowerCase() === "twilio" ? "twilio" : "mock";
}

export function resetSmsAdapterForTests() {
  cached = null;
}

export type { SmsAdapter } from "./types";
