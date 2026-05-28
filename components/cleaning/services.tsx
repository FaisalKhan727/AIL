"use client";

import Image from "next/image";
import {
  ArrowRight,
} from "lucide-react";

const services = [
  {
    title: "Office & Workplace Cleaning",
    description:
      "Daily and scheduled cleaning for corporate offices, co-working spaces, and headquarters. We maintain the professional image your business deserves.",
    features: ["Desk & Workstation Sanitisation", "Breakroom & Kitchen", "Restroom Servicing"],
    image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Commercial Building Cleaning",
    description:
      "End-to-end facility cleaning for shopping centres, warehouses, showrooms, and multi-tenanted commercial buildings of any scale.",
    features: ["Common Area Maintenance", "Floor Care & Polishing", "After-Hours Service"],
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Industrial & Warehouse Cleaning",
    description:
      "Heavy-duty cleaning for factories, distribution centres, and industrial facilities. Equipment and protocols for high-safety environments.",
    features: ["High-Pressure Washing", "Machinery & Equipment Wipe-Down", "Hazard Compliant"],
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Strata & Common Area Cleaning",
    description:
      "Keep lobbies, lifts, hallways, car parks, and shared amenities spotless for tenants, visitors, and residents.",
    features: ["Lobby & Reception", "Lift & Stairwell Cleaning", "Car Park Sweeping"],
    image: "https://images.unsplash.com/photo-1497215842964-222b430dc094?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Post-Construction Cleaning",
    description:
      "Builders&apos; clean and handover-ready preparation for new builds, fit-outs, and renovations — from rough clean to final detail.",
    features: ["Debris & Dust Removal", "Window & Glass Polish", "Final Handover Detail"],
    image: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Carpet & Floor Care",
    description:
      "Professional carpet steam cleaning, hard floor stripping, sealing, and polishing for corporate and commercial environments.",
    features: ["Steam & Hot Water Extraction", "Strip & Seal", "Scheduled Maintenance Plans"],
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?auto=format&fit=crop&w=600&q=80",
  },
];

export function Services() {
  return (
    <section id="services" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-emerald-700">
              Our Services
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Corporate & Commercial Cleaning Solutions
          </h2>
          <p className="text-lg text-gray-600">
            Tailored cleaning programs for businesses of every size — from
            single-tenancy offices to multi-site commercial portfolios.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service) => (
            <div
              key={service.title}
              className="cleaning-card-hover bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm group"
            >
              <div className="relative h-48 overflow-hidden">
                <Image
                  src={service.image}
                  alt={service.title}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <h3 className="absolute bottom-4 left-5 right-5 text-lg font-bold text-white leading-snug">
                  {service.title}
                </h3>
              </div>

              <div className="p-6">
                <p className="text-gray-600 mb-5 leading-relaxed text-sm">
                  {service.description}
                </p>

                <div className="space-y-2 mb-6">
                  {service.features.map((f) => (
                    <span
                      key={f}
                      className="inline-block mr-2 mb-1 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700"
                    >
                      {f}
                    </span>
                  ))}
                </div>

                <a
                  href="#contact"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 group-hover:text-emerald-700 transition-colors"
                >
                  Request a Quote
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
