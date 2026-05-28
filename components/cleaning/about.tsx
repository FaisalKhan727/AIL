"use client";

import Image from "next/image";
import {
  Users,
  Target,
  ClipboardCheck,
  HandshakeIcon,
  ChevronRight,
  Building2,
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
    title: "Dedicated Account Manager",
    description: "A single point of contact to manage your cleaning program end to end.",
  },
];

export function About() {
  return (
    <section id="about" className="py-24 cleaning-gradient-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div className="relative">
            <div className="relative rounded-3xl overflow-hidden shadow-xl">
              <Image
                src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=800&q=80"
                alt="ACS corporate team in discussion"
                width={800}
                height={600}
                className="object-cover w-full h-[420px]"
              />
            </div>

            <div className="absolute -bottom-8 -left-4 w-52 h-44 rounded-2xl overflow-hidden shadow-xl border-4 border-white hidden sm:block">
              <Image
                src="https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=400&q=80"
                alt="Modern corporate office"
                fill
                className="object-cover"
              />
            </div>

            <div className="absolute -bottom-6 -right-6 bg-white rounded-2xl p-5 shadow-xl border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <Building2 className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">500+</p>
                  <p className="text-sm text-gray-500">Corporate Clients</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full mb-4">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium text-emerald-700">
                  About ACS Cleaning
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                The Corporate Cleaning Arm of{" "}
                <span className="cleaning-counter">
                  Allied Corporate Services
                </span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                ACS Cleaning is the specialist cleaning division of Allied
                Corporate Services. We partner with businesses, facility
                managers, and strata companies across Australia to deliver
                cleaning programs that protect your assets and elevate your
                workplace.
              </p>
            </div>

            <p className="text-gray-600 leading-relaxed">
              With over a decade of experience managing multi-site corporate
              contracts, we understand that facility cleaning is about more
              than appearances — it&apos;s about compliance, staff wellbeing,
              and operational continuity. Every engagement is backed by
              transparent reporting, dedicated management, and measurable KPIs.
            </p>

            <div className="grid sm:grid-cols-2 gap-5">
              {values.map((value) => (
                <div
                  key={value.title}
                  className="flex items-start gap-4 p-4 rounded-xl hover:bg-white hover:shadow-sm transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <value.icon className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {value.title}
                    </h3>
                    <p className="text-sm text-gray-500">{value.description}</p>
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
