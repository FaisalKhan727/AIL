"use client";

import Image from "next/image";
import {
  ShieldCheck,
  Leaf,
  Clock,
  BadgeDollarSign,
  HeartHandshake,
  Zap,
} from "lucide-react";

const reasons = [
  {
    icon: ShieldCheck,
    title: "Fully Licensed & Insured",
    description:
      "Complete peace of mind with comprehensive insurance and all required industry certifications.",
  },
  {
    icon: Leaf,
    title: "Eco-Friendly Products",
    description:
      "We use environmentally responsible, non-toxic cleaning products safe for your family and pets.",
  },
  {
    icon: Clock,
    title: "Flexible Scheduling",
    description:
      "Book at times that suit you — early mornings, evenings, weekends, and after-hours available.",
  },
  {
    icon: BadgeDollarSign,
    title: "Competitive Pricing",
    description:
      "Transparent pricing with no hidden fees. Get premium quality cleaning at fair, honest rates.",
  },
  {
    icon: HeartHandshake,
    title: "Satisfaction Guarantee",
    description:
      "Not happy? We'll re-clean at no cost. Your complete satisfaction is our highest priority.",
  },
  {
    icon: Zap,
    title: "Fast & Efficient",
    description:
      "Professional equipment and proven methods mean we clean faster without compromising quality.",
  },
];

export function WhyChooseUs() {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0">
        <Image
          src="https://images.unsplash.com/photo-1497215842964-222b430dc094?auto=format&fit=crop&w=1920&q=80"
          alt="Modern office space"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gray-900/92" />
      </div>

      {/* Background pattern */}
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
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-900/50 border border-emerald-700/30 rounded-full mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-medium text-emerald-300">
              Why Choose Us
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            The ACS Cleaning Difference
          </h2>
          <p className="text-lg text-gray-400">
            We go above and beyond to deliver exceptional cleaning experiences
            that keep our clients coming back.
          </p>
        </div>

        {/* Reasons grid */}
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
