export interface OutboundMeta {
  guardId?: string;
  shiftId?: string;
}

export interface SmsAdapter {
  readonly mode: "mock" | "twilio";
  sendSms(
    to: string,
    body: string,
    meta?: OutboundMeta,
  ): Promise<{ providerSid: string | null; status: string }>;
  verifyInboundSignature(req: Request): Promise<boolean>;
}

export interface InboundPayload {
  from: string;
  to: string;
  body: string;
  providerSid?: string | null;
}
