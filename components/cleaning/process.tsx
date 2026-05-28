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
    title: "Ongoing Management & Reporting",
    description:
      "Regular quality audits, KPI reviews, and account manager check-ins ensure consistent high performance.",
  },
];

export function Process() {
  return (
    <section id="process" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-emerald-700">
              How We Work
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            A Proven Engagement Process
          </h2>
          <p className="text-lg text-gray-600">
            From initial consultation to ongoing account management — here&apos;s
            how we deliver and maintain excellence.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div key={step.number} className="relative group">
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-12 left-[calc(50%+40px)] w-[calc(100%-80px)] h-0.5 bg-gradient-to-r from-emerald-300 to-emerald-100" />
              )}

              <div className="text-center space-y-5">
                <div className="relative inline-flex">
                  <div className="cleaning-step-number text-lg">
                    {step.number}
                  </div>
                </div>

                <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                  <step.icon className="w-8 h-8 text-emerald-600" />
                </div>

                <h3 className="text-lg font-bold text-gray-900">
                  {step.title}
                </h3>
                <p className="text-gray-600 text-sm leading-relaxed">
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
