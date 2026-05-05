import twilio from "twilio";
import { prisma } from "@/lib/prisma";
import type { OutboundMeta, SmsAdapter } from "./types";

function publicBaseUrl(): string {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).replace(/\/+$/, "");
}

export class TwilioSmsAdapter implements SmsAdapter {
  readonly mode = "twilio" as const;
  private readonly client: ReturnType<typeof twilio>;
  private readonly fromNumber: string;
  private readonly authToken: string;

  constructor() {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    if (!sid || !token || !from) {
      throw new Error(
        "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in the environment.",
      );
    }
    this.client = twilio(sid, token);
    this.fromNumber = from;
    this.authToken = token;
  }

  async sendSms(to: string, body: string, meta?: OutboundMeta) {
    const base = publicBaseUrl();
    const statusCallback = base ? `${base}/api/sms/status` : undefined;

    try {
      const msg = await this.client.messages.create({
        to,
        from: this.fromNumber,
        body,
        ...(statusCallback ? { statusCallback } : {}),
      });

      await prisma.smsLog.create({
        data: {
          guardId: meta?.guardId,
          shiftId: meta?.shiftId,
          direction: "OUTBOUND",
          fromNumber: this.fromNumber,
          toNumber: to,
          body,
          providerSid: msg.sid,
          status: msg.status ?? "queued",
        },
      });

      return { providerSid: msg.sid, status: msg.status ?? "queued" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code ?? "")
          : "";

      await prisma.smsLog.create({
        data: {
          guardId: meta?.guardId,
          shiftId: meta?.shiftId,
          direction: "OUTBOUND",
          fromNumber: this.fromNumber,
          toNumber: to,
          body,
          providerSid: null,
          status: "failed",
          errorCode: code || null,
        },
      });

      throw new Error(`Twilio sendSms failed: ${message}`);
    }
  }

  async verifyInboundSignature(req: Request): Promise<boolean> {
    const signature = req.headers.get("x-twilio-signature");
    if (!signature) return false;

    const reqUrl = new URL(req.url);
    const proto = req.headers.get("x-forwarded-proto") || reqUrl.protocol.replace(":", "");
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || reqUrl.host;
    const url = `${proto}://${host}${reqUrl.pathname}${reqUrl.search}`;

    const text = await req.text();
    const params: Record<string, string> = {};
    for (const [k, v] of new URLSearchParams(text)) params[k] = v;

    return twilio.validateRequest(this.authToken, signature, url, params);
  }
}
