"use client";

import {
  MessageSquare,
  ClipboardCheck,
  CalendarCheck,
  BarChart3,
} from "lucide-react";

const steps = [
  {
    number: "01",
    icon: MessageSquare,
    title: "Initial Consultation",
    description:
      "We discuss your facility requirements, scope, frequency, and any compliance or access considerations.",
  },
  {
    number: "02",
    icon: ClipboardCheck,
    title: "Site Assessment & Proposal",
    description:
      "Our team inspects your premises and delivers a detailed scope of work with transparent, competitive pricing.",
  },
  {
    number: "03",
    icon: CalendarCheck,
    title: "Mobilisation & Onboarding",
    description:
      "We assign a dedicated team, complete site inductions, set up schedules, and begin service — seamlessly.",
  },
  {
    number: "04",
    icon: BarChart3,
    title: "Ongoing Management",
    description:
      "Regular quality audits, KPI reviews, and account manager check-ins ensure consistent high performance.",
  },
];

export function Process() {
  return (
    <section id="process" className="py-20 lg:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold text-[#0E9F6E] uppercase tracking-wider mb-3">
            How We Work
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4">
            A Proven Engagement Process
          </h2>
          <p className="text-[#4B5563] text-base leading-relaxed">
            From initial consultation to ongoing account management — here&apos;s
            how we deliver and maintain excellence.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div key={step.number} className="relative group">
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-6 left-[calc(50%+32px)] w-[calc(100%-64px)] h-px bg-[#D1FAE5]" />
              )}

              <div className="text-center space-y-4">
                <div className="relative inline-flex">
                  <div className="cleaning-step-number">
                    {step.number}
                  </div>
                </div>

                <div className="w-14 h-14 mx-auto rounded-xl bg-[#F0FDF4] flex items-center justify-center group-hover:bg-[#D1FAE5] transition-colors">
                  <step.icon className="w-7 h-7 text-[#047857]" />
                </div>

                <h3 className="text-[1.0625rem] font-bold text-[#0F172A]">
                  {step.title}
                </h3>
                <p className="text-[#6B7280] text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
