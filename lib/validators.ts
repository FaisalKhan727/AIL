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
  employmentType: z.enum(["CASUAL", "PART_TIME", "FULL_TIME"]).optional(),
  payrollRef: z.string().trim().max(40).optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().optional().or(z.literal("").transform(() => undefined)),
  active: z.boolean().optional(),
});

export const guardUpdateSchema = guardCreateSchema.partial();

export const siteCreateSchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  contactName: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  contactPhone: z.string().trim().optional().or(z.literal("").transform(() => undefined)),
  // Hourly rate charged to the client; empty clears it.
  billRate: z.union([z.number(), z.string()]).nullish().transform((v) => (v === undefined ? undefined : v === null || v === "" ? null : Number(v))).refine((v) => v === undefined || v === null || (Number.isFinite(v) && v >= 0), "Bill rate must be a positive number"),
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

const dowEnum = z.enum(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]);

export const recurrenceSchema = z.object({
  daysOfWeek: z.array(dowEnum).min(1),
  untilDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "untilDate must be yyyy-MM-dd"),
});

export const shiftCreateSchema = z.object({
  rosterId: z.string().min(1),
  guardId: z.string().min(1),
  siteId: z.string().min(1),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  role: z.string().optional().or(z.literal("").transform(() => undefined)),
  notes: z.string().optional().or(z.literal("").transform(() => undefined)),
  recurrence: recurrenceSchema.optional(),
  // Why a guard without a current, verified security licence is being
  // rostered anyway. Only consulted when the company blocks such shifts.
  complianceOverride: z.string().trim().max(200).optional(),
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
