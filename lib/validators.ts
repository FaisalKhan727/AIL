import { z } from "zod";

export const phoneE164 = z
  .string()
  .trim()
  .regex(/^\+\d{8,15}$/, "Phone must be E.164 (e.g. +61412345678)");

export const guardCreateSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: phoneE164,
  email: z.string().trim().email().optional().or(z.literal("").transform(() => undefined)),
  licenceNumber: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  licenceExpiry: z.string().optional().or(z.literal("").transform(() => undefined)),
  payRate: z.coerce.number().nonnegative().optional(),
  notes: z.string().optional().or(z.literal("").transform(() => undefined)),
  active: z.boolean().optional(),
});

export const guardUpdateSchema = guardCreateSchema.partial();

export const siteCreateSchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  contactName: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  contactPhone: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().optional().or(z.literal("").transform(() => undefined)),
  active: z.boolean().optional(),
});

export const siteUpdateSchema = siteCreateSchema.partial();

export const rosterCreateSchema = z.object({
  name: z.string().trim().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

export const rosterUpdateSchema = rosterCreateSchema.partial().extend({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export const shiftCreateSchema = z.object({
  rosterId: z.string().min(1),
  guardId: z.string().min(1),
  siteId: z.string().min(1),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  role: z.string().optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().optional().or(z.literal("").transform(() => undefined)),
});

export const shiftBatchCreateSchema = z.object({
  rosterId: z.string().min(1),
  guardIds: z.array(z.string().min(1)).min(1),
  siteId: z.string().min(1),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  role: z.string().optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().optional().or(z.literal("").transform(() => undefined)),
});

export const shiftUpdateSchema = shiftCreateSchema.partial().extend({
  status: z.enum(["PENDING", "CONFIRMED", "REJECTED", "WORKED", "NO_SHOW", "CANCELLED"]).optional(),
  workedStart: z.string().optional().or(z.literal("").transform(() => undefined)),
  workedEnd: z.string().optional().or(z.literal("").transform(() => undefined)),
});

export const inboundSmsSchema = z.object({
  From: z.string().min(1),
  To: z.string().optional(),
  Body: z.string(),
  MessageSid: z.string().optional(),
});
