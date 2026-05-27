"use client";

import {
  Building2,
  Home,
  Warehouse,
  HardHat,
  Sofa,
  Wind,
  ArrowRight,
} from "lucide-react";

const services = [
  {
    icon: Building2,
    title: "Office Cleaning",
    description:
      "Keep your workplace spotless and professional. Daily, weekly, or custom cleaning schedules to suit your business needs.",
    features: ["Desk & Surface Sanitisation", "Kitchen & Breakroom", "Restroom Deep Clean"],
    color: "emerald",
  },
  {
    icon: Home,
    title: "Residential Cleaning",
    description:
      "A sparkling home without the hassle. Our trained team delivers meticulous home cleaning you can rely on.",
    features: ["Regular Housekeeping", "Spring Cleaning", "Move In/Out Cleans"],
    color: "blue",
  },
  {
    icon: Warehouse,
    title: "Commercial Cleaning",
    description:
      "Large-scale cleaning solutions for retail spaces, warehouses, and commercial facilities of any size.",
    features: ["Floor Care & Polishing", "High-Traffic Areas", "After-Hours Service"],
    color: "purple",
  },
  {
    icon: HardHat,
    title: "Construction Cleaning",
    description:
      "Post-construction cleanup to make your new build or renovation ready for handover and occupancy.",
    features: ["Debris Removal", "Final Detail Clean", "Window & Glass Cleaning"],
    color: "amber",
  },
  {
    icon: Sofa,
    title: "Carpet & Upholstery",
    description:
      "Deep cleaning for carpets, rugs, and upholstered furniture using professional-grade equipment.",
    features: ["Steam Cleaning", "Stain Removal", "Odour Treatment"],
    color: "rose",
  },
  {
    icon: Wind,
    title: "Window Cleaning",
    description:
      "Crystal-clear windows inside and out. We handle residential and multi-storey commercial buildings.",
    features: ["Interior & Exterior", "High-Rise Capable", "Frame & Sill Cleaning"],
    color: "cyan",
  },
];

const colorMap: Record<string, { bg: string; icon: string; badge: string }> = {
  emerald: {
    bg: "bg-emerald-50",
    icon: "text-emerald-600",
    badge: "bg-emerald-100 text-emerald-700",
  },
  blue: {
    bg: "bg-blue-50",
    icon: "text-blue-600",
    badge: "bg-blue-100 text-blue-700",
  },
  purple: {
    bg: "bg-purple-50",
    icon: "text-purple-600",
    badge: "bg-purple-100 text-purple-700",
  },
  amber: {
    bg: "bg-amber-50",
    icon: "text-amber-600",
    badge: "bg-amber-100 text-amber-700",
  },
  rose: {
    bg: "bg-rose-50",
    icon: "text-rose-600",
    badge: "bg-rose-100 text-rose-700",
  },
  cyan: {
    bg: "bg-cyan-50",
    icon: "text-cyan-600",
    badge: "bg-cyan-100 text-cyan-700",
  },
};

export function Services() {
  return (
    <section id="services" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-emerald-700">
              Our Services
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Comprehensive Cleaning Solutions
          </h2>
          <p className="text-lg text-gray-600">
            From everyday maintenance to specialised deep cleans, ACS Cleaning
            has the expertise and equipment for every job.
          </p>
        </div>

        {/* Services grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service) => {
            const colors = colorMap[service.color];
            return (
              <div
                key={service.title}
                className="cleaning-card-hover bg-white rounded-2xl p-8 border border-gray-100 shadow-sm group"
              >
                <div
                  className={`w-14 h-14 rounded-2xl ${colors.bg} flex items-center justify-center mb-6`}
                >
                  <service.icon className={`w-7 h-7 ${colors.icon}`} />
                </div>

                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {service.title}
                </h3>
                <p className="text-gray-600 mb-5 leading-relaxed">
                  {service.description}
                </p>

                <div className="space-y-2 mb-6">
                  {service.features.map((f) => (
                    <span
                      key={f}
                      className={`inline-block mr-2 mb-1 px-3 py-1 rounded-full text-xs font-medium ${colors.badge}`}
                    >
                      {f}
                    </span>
                  ))}
                </div>

                <a
                  href="#contact"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 group-hover:text-emerald-700 transition-colors"
                >
                  Learn More
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
