import { prisma } from "@/lib/prisma";
import type { OutboundMeta, SmsAdapter } from "./types";

/**
 * Local-development adapter, selected only when SMS_MODE=mock. Nothing is
 * sent: the message is printed to the server console and written to the SMS
 * log with status "mock" so the rest of the app behaves as it would live.
 */
export class MockSmsAdapter implements SmsAdapter {
  readonly mode = "mock" as const;

  async sendSms(to: string, body: string, meta?: OutboundMeta) {
    console.log(`[sms:mock] -> ${to}\n${body}\n`);
    await prisma.smsLog.create({
      data: {
        guardId: meta?.guardId,
        shiftId: meta?.shiftId,
        direction: "OUTBOUND",
        fromNumber: process.env.TWILIO_FROM_NUMBER || "MOCK",
        toNumber: to,
        body: meta?.logBody ?? body,
        providerSid: null,
        status: "mock",
      },
    });
    return { providerSid: null, status: "mock" };
  }

  async verifyInboundSignature(): Promise<boolean> {
    return process.env.NODE_ENV !== "production";
  }
}
