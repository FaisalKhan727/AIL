import { prisma } from "@/lib/prisma";
import type { OutboundMeta, SmsAdapter } from "./types";

export class MockSmsAdapter implements SmsAdapter {
  readonly mode = "mock" as const;

  async sendSms(to: string, body: string, meta?: OutboundMeta) {
    const fromNumber = process.env.TWILIO_FROM_NUMBER || "+61400000000";

    await prisma.smsLog.create({
      data: {
        guardId: meta?.guardId,
        shiftId: meta?.shiftId,
        direction: "OUTBOUND",
        fromNumber,
        toNumber: to,
        body,
        providerSid: null,
        status: "mock",
      },
    });

    // Eye-catching console block so it's easy to spot in dev.
    const banner = "─".repeat(60);
    // eslint-disable-next-line no-console
    console.log(
      `\n${banner}\n📤 [MOCK SMS] → ${to}\n${banner}\n${body}\n${banner}\n`,
    );

    return { providerSid: null, status: "mock" };
  }

  // In mock mode, inbound is coming from our own simulator UI, so we trust it.
  async verifyInboundSignature(_req: Request): Promise<boolean> {
    return true;
  }
}
