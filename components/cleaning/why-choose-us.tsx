"use client";

import {
  ShieldCheck,
  FileCheck,
  Clock,
  BarChart3,
  HeartHandshake,
  Users,
} from "lucide-react";

const reasons = [
  {
    icon: ShieldCheck,
    title: "$20M Public Liability",
    description:
      "Comprehensive insurance coverage and full WorkCover compliance — protecting your business and ours.",
  },
  {
    icon: FileCheck,
    title: "OH&S & Compliance",
    description:
      "SWMS, SDS documentation, and site-specific risk assessments for every facility we clean.",
  },
  {
    icon: Clock,
    title: "Flexible Contracts",
    description:
      "Daily, weekly, or periodic schedules including after-hours, weekends, and 24/7 emergency response.",
  },
  {
    icon: BarChart3,
    title: "KPI & Quality Reporting",
    description:
      "Regular site audits, performance dashboards, and transparent reporting to your facility management team.",
  },
  {
    icon: HeartHandshake,
    title: "Dedicated Account Management",
    description:
      "A named account manager for your portfolio — one call for escalations, variations, or new sites.",
  },
  {
    icon: Users,
    title: "Vetted & Uniformed Staff",
    description:
      "Police-checked, trained in your site protocols, and wearing ACS-branded uniforms for easy identification.",
  },
];

export function WhyChooseUs() {
  return (
    <section className="py-20 lg:py-24 bg-[#0F172A] relative overflow-hidden">
      <div className="absolute inset-0 opacity-[0.03]">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold text-[#34D399] uppercase tracking-wider mb-3">
            Why Businesses Choose ACS
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Built for Corporate Standards
          </h2>
          <p className="text-[#94A3B8] text-base leading-relaxed">
            We operate to the standards that corporate clients, facility
            managers, and strata companies demand.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reasons.map((reason) => (
            <div
              key={reason.title}
              className="group p-7 rounded-2xl bg-[#1E293B] border border-[#334155] hover:border-[#047857]/40 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-[#047857]/15 flex items-center justify-center mb-5 group-hover:bg-[#047857]/25 transition-colors">
                <reason.icon className="w-6 h-6 text-[#34D399]" />
              </div>
              <h3 className="text-[1.0625rem] font-bold text-white mb-2.5">
                {reason.title}
              </h3>
              <p className="text-[#94A3B8] text-sm leading-relaxed">
                {reason.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
