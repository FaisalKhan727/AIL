/**
 * scripts/seed-onboarding-placeholders.ts
 *
 * Idempotent: only seeds if the company has no current SopVersion or
 * ContractTemplate yet. Re-running is safe.
 *
 * Per spec the user will provide real SOP / contract content later;
 * this just gives us valid version=1 rows to point onboardingData FKs
 * at during steps 2-6.
 */

import { PrismaClient } from "@prisma/client";

const SOP_BODY = `# Standard Operating Procedure (placeholder)

## 1. Conduct
You represent the company at all times while on duty. Be punctual, courteous and professional.

## 2. Reporting
Report all incidents — no matter how minor — via the incident-report feature in the app within 24 hours of the shift ending.

## 3. Use of Force
Force is a last resort, must be reasonable and proportionate, and must be reported. Use of force in any other circumstance is grounds for termination.

## 4. Confidentiality
All client information, site layouts, access codes and incident details are strictly confidential and must not be shared with anyone outside the company.

## 5. Punctuality
Arrive on site 10 minutes before your scheduled shift start. If you are running late, notify the control room immediately via SMS or push notification.

(Admin: replace this placeholder with your real SOP via Settings → Standard Operating Procedure.)
`;

const CONTRACT_BODY = `CASUAL EMPLOYMENT CONTRACT (placeholder)

This casual employment contract is entered into between:

EMPLOYER: {employerName}
ABN: {employerAbn}

and

EMPLOYEE: {employeeName}
Address: {employeeAddress}
Mobile: {employeeMobile}
Date of birth: {employeeDob}

Commencement date: {commencementDate}

1. EMPLOYMENT TYPE
Casual. The employee accepts that no minimum hours are guaranteed and that each engagement is a separate engagement.

2. PAY
{hourlyRateClause}

3. LICENCE
The employee must hold a current security licence at all times. Failure to maintain a valid licence will result in immediate suspension from shifts.

4. CONDUCT
The employee will comply with the Standard Operating Procedure as published by the employer from time to time.

5. TERMINATION
Either party may terminate this engagement at any time consistent with the Fair Work Act 2009.

Signed by employee:
{signatoryName}
Date: {signatoryDate}

(Admin: replace this placeholder with your real casual contract via Settings → Employment Contract Template.)
`;

async function main() {
  const p = new PrismaClient();
  try {
    const companies = await p.company.findMany({
      select: { id: true, name: true },
    });

    for (const c of companies) {
      // First OWNER admin in the company is the createdBy of these seeds.
      // Falls back to first admin of any role if no OWNER exists.
      const owner =
        (await p.adminUser.findFirst({
          where: { companyId: c.id, role: "OWNER" },
          select: { id: true, email: true },
        })) ??
        (await p.adminUser.findFirst({
          where: { companyId: c.id },
          select: { id: true, email: true },
        }));
      if (!owner) {
        console.log(`  ${c.name}: no AdminUser yet — skipping seed.`);
        continue;
      }

      const existingSop = await p.sopVersion.findFirst({
        where: { companyId: c.id, isCurrent: true },
      });
      if (existingSop) {
        console.log(`  ${c.name}: SopVersion v${existingSop.version} already current — skipping.`);
      } else {
        await p.sopVersion.create({
          data: {
            companyId: c.id,
            version: 1,
            title: "Standard Operating Procedure",
            body: SOP_BODY,
            isCurrent: true,
            createdBy: owner.id,
          },
        });
        console.log(`  ${c.name}: seeded SopVersion v1 (createdBy ${owner.email}).`);
      }

      const existingContract = await p.contractTemplate.findFirst({
        where: { companyId: c.id, isCurrent: true },
      });
      if (existingContract) {
        console.log(`  ${c.name}: ContractTemplate v${existingContract.version} already current — skipping.`);
      } else {
        await p.contractTemplate.create({
          data: {
            companyId: c.id,
            version: 1,
            name: "Casual Security Employment v1",
            templateContent: CONTRACT_BODY,
            isCurrent: true,
            createdBy: owner.id,
          },
        });
        console.log(`  ${c.name}: seeded ContractTemplate v1 (createdBy ${owner.email}).`);
      }
    }
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
