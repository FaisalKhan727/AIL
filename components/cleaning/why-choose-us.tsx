"use client";

import Image from "next/image";
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
    <section className="py-24 relative overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1920&q=80"
          alt="Corporate building"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[#0F172A]/93" />
      </div>

      <div className="absolute inset-0 opacity-5">
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
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-900/50 border border-emerald-700/30 rounded-full mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">
              Why Businesses Choose ACS
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Built for Corporate Standards
          </h2>
          <p className="text-lg text-gray-400">
            We operate to the standards that corporate clients, facility
            managers, and strata companies demand.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {reasons.map((reason) => (
            <div
              key={reason.title}
              className="group p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 hover:border-emerald-700/30 transition-all duration-300"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-6 group-hover:bg-emerald-500/20 transition-colors">
                <reason.icon className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-3">
                {reason.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                {reason.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
