"use client";

import Image from "next/image";
import {
  ArrowRight,
  Shield,
  Clock,
  Award,
  CheckCircle2,
} from "lucide-react";

const stats = [
  { icon: Shield, value: "100%", label: "Satisfaction Guaranteed" },
  { icon: Clock, value: "24/7", label: "Available Anytime" },
  { icon: Award, value: "10+", label: "Years Experience" },
];

export function Hero() {
  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center overflow-hidden bg-gray-50"
    >
      {/* Background image */}
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1920&q=80"
          alt="Professional cleaning service"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/60" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left content */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-full">
              <Image
                src="/cleaning/logo.jpg"
                alt="ACS"
                width={20}
                height={20}
                className="rounded-sm"
              />
              <span className="text-sm font-medium text-emerald-700">
                Allied Corporate Services
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight text-gray-900">
              Premium{" "}
              <span className="relative">
                <span className="cleaning-counter">Cleaning</span>
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  viewBox="0 0 300 12"
                  fill="none"
                >
                  <path
                    d="M2 8 C50 2, 100 2, 150 6 S250 2, 298 8"
                    stroke="#F59E0B"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <br />
              Solutions for Every Space
            </h1>

            <p className="text-lg text-gray-600 max-w-lg leading-relaxed">
              ACS Cleaning delivers spotless results with eco-friendly products
              and trained professionals. From offices to homes, we make every
              space shine.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <a href="#contact" className="cleaning-btn-primary text-base">
                Get a Free Quote
                <ArrowRight className="w-5 h-5" />
              </a>
              <a href="#services" className="cleaning-btn-secondary text-base">
                Our Services
              </a>
            </div>

            <div className="flex flex-wrap gap-6 pt-2">
              {[
                "Eco-Friendly Products",
                "Trained & Insured Staff",
                "Flexible Scheduling",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span className="text-sm text-gray-600">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — hero image showcase */}
          <div className="relative hidden lg:block">
            <div className="relative w-full max-w-lg mx-auto">
              {/* Main image */}
              <div className="relative rounded-3xl overflow-hidden shadow-2xl">
                <Image
                  src="https://images.unsplash.com/photo-1628177142898-93e36e4e3a50?auto=format&fit=crop&w=800&q=80"
                  alt="Professional cleaner at work"
                  width={800}
                  height={600}
                  className="object-cover w-full h-[480px]"
                  priority
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
              </div>

              {/* Floating cards */}
              <div className="absolute -left-8 top-1/4 bg-white rounded-2xl p-4 shadow-xl cleaning-float">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Fully Insured</p>
                    <p className="text-xs text-gray-500">Peace of mind</p>
                  </div>
                </div>
              </div>

              <div
                className="absolute -right-4 bottom-1/4 bg-white rounded-2xl p-4 shadow-xl cleaning-float"
                style={{ animationDelay: "3s" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Award className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Top Rated</p>
                    <p className="text-xs text-gray-500">5-star service</p>
                  </div>
                </div>
              </div>

              <div
                className="absolute left-1/4 -bottom-4 bg-white rounded-2xl p-4 shadow-xl cleaning-float"
                style={{ animationDelay: "1.5s" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">On Time</p>
                    <p className="text-xs text-gray-500">Always punctual</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mt-16 lg:mt-24 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-4 bg-white rounded-2xl p-6 shadow-md border border-gray-100"
            >
              <div className="cleaning-icon-box">
                <stat.icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
