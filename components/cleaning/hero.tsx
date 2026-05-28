"use client";

import Image from "next/image";
import {
  ArrowRight,
  Shield,
  Clock,
  Award,
  Building2,
  CheckCircle2,
} from "lucide-react";

const stats = [
  { icon: Shield, value: "100%", label: "Fully Insured & Compliant" },
  { icon: Clock, value: "24/7", label: "After-Hours Available" },
  { icon: Award, value: "10+", label: "Years in Corporate Cleaning" },
  { icon: Building2, value: "500+", label: "Facilities Serviced" },
];

export function Hero() {
  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center overflow-hidden bg-[#0F172A]"
    >
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1920&q=80"
          alt="Modern corporate office space"
          fill
          className="object-cover opacity-40"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0F172A] via-[#0F172A]/80 to-[#0F172A]/50" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/15 backdrop-blur-sm rounded-full">
              <Image
                src="/cleaning/logo.jpg"
                alt="ACS"
                width={20}
                height={20}
                className="rounded-sm brightness-0 invert"
              />
              <span className="text-sm font-medium text-[#6EE7B7]">
                Allied Corporate Services
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold leading-[1.1] text-white">
              Corporate{" "}
              <span className="text-[#34D399]">Cleaning</span>
              <br />
              Your Business Can Trust
            </h1>

            <p className="text-lg text-[#CBD5E1] max-w-lg leading-relaxed">
              ACS Cleaning delivers reliable, high-standard cleaning for
              offices, commercial buildings, and corporate facilities. Trusted
              by leading businesses across Australia.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <a href="#contact" className="cleaning-btn-primary text-base">
                Request a Quote
                <ArrowRight className="w-5 h-5" />
              </a>
              <a href="#services" className="inline-flex items-center gap-2 border-2 border-white/25 text-white px-8 py-3.5 rounded-full font-semibold hover:bg-white/10 transition-colors text-[0.9375rem]">
                Our Services
              </a>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3 pt-2">
              {[
                "OH&S Compliant",
                "Vetted & Trained Staff",
                "Tailored Contracts",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-[#34D399]" />
                  <span className="text-[0.9375rem] text-[#CBD5E1]">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="relative w-full max-w-lg mx-auto">
              <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/10">
                <Image
                  src="https://images.unsplash.com/photo-1497215842964-222b430dc094?auto=format&fit=crop&w=800&q=80"
                  alt="Pristine corporate environment"
                  width={800}
                  height={600}
                  className="object-cover w-full h-[460px]"
                  priority
                />
              </div>

              <div className="absolute -left-8 top-1/4 bg-white rounded-xl p-4 shadow-xl cleaning-float">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#D1FAE5] flex items-center justify-center">
                    <Shield className="w-5 h-5 text-[#047857]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1F2937]">Fully Insured</p>
                    <p className="text-xs text-[#6B7280]">$20M public liability</p>
                  </div>
                </div>
              </div>

              <div
                className="absolute -right-4 bottom-1/3 bg-white rounded-xl p-4 shadow-xl cleaning-float"
                style={{ animationDelay: "3s" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] flex items-center justify-center">
                    <Award className="w-5 h-5 text-[#D97706]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1F2937]">ISO Certified</p>
                    <p className="text-xs text-[#6B7280]">Quality assured</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16 lg:mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-4 bg-white/[0.07] backdrop-blur-sm rounded-xl p-5 border border-white/10"
            >
              <div className="w-11 h-11 rounded-lg bg-[#34D399]/15 flex items-center justify-center flex-shrink-0">
                <stat.icon className="w-5 h-5 text-[#34D399]" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-[#94A3B8] leading-tight">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
