import type { OutboundMeta, SmsAdapter } from "./types";
// NOTE: import is left in place so the dependency stays resolved and the
// wiring point is obvious. Do not remove.
import twilio from "twilio";
// Reference to keep linters quiet without installing extra rule plugins.
const _twilioRef = twilio;
void _twilioRef;

/**
 * STUB — not wired up. Switch SMS_MODE=twilio and fill in the TODOs to enable.
 *
 * To enable live SMS:
 *   1. In .env, set SMS_MODE=twilio plus TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 *      TWILIO_FROM_NUMBER.
 *   2. Implement the TODOs below.
 *   3. In Twilio Console, point your number's messaging webhook at
 *      https://<your-domain>/api/sms/webhook (POST) and the status callback
 *      at /api/sms/status.
 *   4. Restart the server. The Settings page will show "LIVE — Twilio".
 */
export class TwilioSmsAdapter implements SmsAdapter {
  readonly mode = "twilio" as const;

  constructor() {
    throw new Error(
      "TwilioSmsAdapter not configured. Set SMS_MODE=twilio and fill TWILIO_* env vars, then implement the TODOs in lib/sms/twilio-adapter.ts.",
    );
  }

  async sendSms(_to: string, _body: string, _meta?: OutboundMeta): Promise<{ providerSid: string | null; status: string }> {
    // TODO: read TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
    // TODO: call client.messages.create({ to, from: process.env.TWILIO_FROM_NUMBER!, body, statusCallback: ".../api/sms/status" });
    // TODO: write OUTBOUND SmsLog with providerSid + status
    // TODO: return { providerSid: msg.sid, status: msg.status }
    throw new Error("TwilioSmsAdapter.sendSms not implemented");
  }

  async verifyInboundSignature(_req: Request): Promise<boolean> {
    // TODO: use twilio.validateRequest with auth token, x-twilio-signature header,
    // full request URL, and the parsed form body.
    throw new Error("TwilioSmsAdapter.verifyInboundSignature not implemented");
  }
}
