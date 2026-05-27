"use client";

import {
  Users,
  Target,
  Leaf,
  HandshakeIcon,
  ChevronRight,
} from "lucide-react";

const values = [
  {
    icon: Target,
    title: "Quality First",
    description: "We never cut corners. Every clean meets our rigorous quality standards.",
  },
  {
    icon: Leaf,
    title: "Eco-Friendly",
    description: "Sustainable products and practices that protect people and the planet.",
  },
  {
    icon: Users,
    title: "Trained Staff",
    description: "Every team member is vetted, trained, and insured for your peace of mind.",
  },
  {
    icon: HandshakeIcon,
    title: "Trusted Partner",
    description: "Long-term relationships built on reliability, transparency, and results.",
  },
];

export function About() {
  return (
    <section id="about" className="py-24 cleaning-gradient-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left visual */}
          <div className="relative">
            <div className="relative rounded-3xl overflow-hidden">
              {/* Visual placeholder */}
              <div className="aspect-[4/3] cleaning-gradient rounded-3xl flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
                <div className="relative text-center text-white space-y-4">
                  <p className="text-7xl font-extrabold">10+</p>
                  <p className="text-xl font-medium opacity-90">
                    Years of Excellence
                  </p>
                </div>
              </div>
            </div>

            {/* Floating stat card */}
            <div className="absolute -bottom-6 -right-6 bg-white rounded-2xl p-5 shadow-xl border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Users className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">500+</p>
                  <p className="text-sm text-gray-500">Happy Clients</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right content */}
          <div className="space-y-8">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full mb-4">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm font-medium text-emerald-700">
                  About ACS Cleaning
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
                A Branch of{" "}
                <span className="cleaning-counter">
                  Allied Corporate Services
                </span>
              </h2>
              <p className="text-lg text-gray-600 leading-relaxed">
                ACS Cleaning is the dedicated cleaning division of Allied
                Corporate Services, delivering premium cleaning solutions
                across Australia. With over a decade of industry experience,
                we combine professional expertise with personalised service to
                keep your spaces immaculate.
              </p>
            </div>

            <p className="text-gray-600 leading-relaxed">
              Our mission is simple: provide reliable, high-quality cleaning
              that our clients can count on, every single time. Whether
              it&apos;s a small office or a multi-level commercial building,
              we bring the same level of dedication and attention to detail.
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
              Work With Us
              <ChevronRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
