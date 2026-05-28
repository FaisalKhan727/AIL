"use client";

import Image from "next/image";
import {
  Building2,
  Target,
  ClipboardCheck,
  Users,
  HandshakeIcon,
  ChevronRight,
} from "lucide-react";

const values = [
  {
    icon: Target,
    title: "Consistent Standards",
    description: "Rigorous quality audits and KPI reporting across every site we service.",
  },
  {
    icon: ClipboardCheck,
    title: "OH&S Compliant",
    description: "Full compliance with workplace health and safety regulations at every level.",
  },
  {
    icon: Users,
    title: "Vetted Workforce",
    description: "Police-checked, trained, and uniformed staff with site-specific inductions.",
  },
  {
    icon: HandshakeIcon,
    title: "Account Manager",
    description: "A single point of contact to manage your cleaning program end to end.",
  },
];

export function About() {
  return (
    <section id="about" className="py-20 lg:py-24 bg-[#F9FAFB]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-14 items-center">
          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden shadow-lg bg-[#F1F5F9]">
              <Image
                src="/cleaning/images/mop-floor.jpg"
                alt="Professional floor mopping"
                width={800}
                height={600}
                className="object-cover w-full h-[400px]"
              />
            </div>

            <div className="absolute -bottom-6 -left-4 w-48 h-40 rounded-xl overflow-hidden shadow-lg border-4 border-white hidden sm:block bg-[#F1F5F9]">
              <Image
                src="/cleaning/images/supplies.jpg"
                alt="Professional cleaning supplies"
                fill
                className="object-cover"
              />
            </div>

            <div className="absolute -bottom-4 -right-4 bg-white rounded-xl p-4 shadow-lg border border-[#E5E7EB]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-lg bg-[#D1FAE5] flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-[#047857]" />
                </div>
                <div>
                  <p className="text-xl font-bold text-[#0F172A]">500+</p>
                  <p className="text-sm text-[#6B7280]">Corporate Clients</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-7">
            <div>
              <p className="text-sm font-semibold text-[#0E9F6E] uppercase tracking-wider mb-3">
                About ACS Cleaning
              </p>
              <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-5">
                The Corporate Cleaning Arm of{" "}
                <span className="cleaning-counter">
                  Allied Corporate Services
                </span>
              </h2>
              <p className="text-[#4B5563] text-base leading-relaxed">
                ACS Cleaning is the specialist cleaning division of Allied
                Corporate Services. We partner with businesses, facility
                managers, and strata companies across Australia to deliver
                cleaning programs that protect your assets and elevate your
                workplace.
              </p>
            </div>

            <p className="text-[#4B5563] text-base leading-relaxed">
              With over a decade of experience managing multi-site corporate
              contracts, we understand that facility cleaning is about more
              than appearances — it&apos;s about compliance, staff wellbeing,
              and operational continuity. Every engagement is backed by
              transparent reporting, dedicated management, and measurable KPIs.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {values.map((value) => (
                <div
                  key={value.title}
                  className="flex items-start gap-3.5 p-4 rounded-xl bg-white border border-[#E5E7EB] hover:border-[#D1FAE5] transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-[#D1FAE5] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <value.icon className="w-4.5 h-4.5 text-[#047857]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#0F172A] text-[0.9375rem] mb-1">
                      {value.title}
                    </h3>
                    <p className="text-sm text-[#6B7280] leading-relaxed">{value.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <a
              href="#contact"
              className="inline-flex items-center gap-2 cleaning-btn-primary"
            >
              Partner With Us
              <ChevronRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
