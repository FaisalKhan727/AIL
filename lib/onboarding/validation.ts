import { z } from "zod";

/**
 * Per-step input schemas. Server-side validation; clients also enforce
 * these to disable the Continue button until inputs pass.
 *
 * In step 2 (this build) tfn/bsb/account-# come in as plain strings.
 * In step 3 we route them through lib/crypto.ts so what lands in the
 * DB is base64 cipher; the client wire format stays unchanged.
 */

// Step 1 — welcome. No input; advancing the step is implicit (the
// front-end POSTs to step 2 directly).

export const personalSchema = z.object({
  legalName: z.string().trim().min(2, "Required"),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-mm-dd"),
  residentialAddress: z.string().trim().min(10, "Please enter your full address"),
  email: z.string().trim().email("Valid email required"),
  emergencyContactName: z.string().trim().min(2, "Required"),
  emergencyContactPhone: z.string().trim().min(8, "Enter a valid phone number"),
});

export const workingRightsSchema = z
  .object({
    workingRightsStatus: z.enum(["CITIZEN", "PERMANENT_RESIDENT", "WORKING_VISA"]),
    visaSubclass: z.string().trim().optional(),
    visaExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    visaHoursPerFortnight: z.number().int().min(0).max(168).optional(),
  })
  .refine(
    (v) =>
      v.workingRightsStatus !== "WORKING_VISA" ||
      (v.visaSubclass && v.visaSubclass.length > 0 && v.visaExpiry),
    {
      message: "Visa holders must provide subclass and expiry",
      path: ["visaSubclass"],
    },
  );

export const taxBankSchema = z.object({
  tfn: z.string().regex(/^\d{8,9}$/, "TFN must be 8-9 digits"),
  taxFreeThreshold: z.boolean(),
  bankAccountName: z.string().trim().min(2, "Required"),
  bankBsb: z.string().regex(/^\d{3}-?\d{3}$/, "BSB must be 6 digits"),
  bankAccountNumber: z.string().regex(/^\d{6,10}$/, "Account number must be 6-10 digits"),
});

export const licenceSchema = z.object({
  licenceNumber: z.string().trim().min(4, "Required"),
  licenceClass: z.enum(["A", "B", "BOTH"]),
  licenceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-mm-dd"),
  // Photo URLs are written by Step 4 (Vercel Blob upload). Step 2 just
  // accepts them as optional pass-through fields.
  licenceFrontPhotoUrl: z.string().url().optional().or(z.literal("")),
  licenceBackPhotoUrl: z.string().url().optional().or(z.literal("")),
});

export const sopSchema = z.object({
  sopAcknowledged: z.literal(true),
});

export const contractSchema = z.object({
  contractSignatureName: z.string().trim().min(2, "Type your full legal name"),
  contractAcknowledged: z.literal(true),
});

export const STEP_SCHEMAS: Record<number, z.ZodTypeAny> = {
  2: personalSchema,
  3: workingRightsSchema,
  4: taxBankSchema,
  5: licenceSchema,
  6: sopSchema,
  7: contractSchema,
};
