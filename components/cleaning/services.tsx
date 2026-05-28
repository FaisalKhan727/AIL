"use client";

import { ArrowRight } from "lucide-react";

const services = [
  {
    title: "Office & Workplace Cleaning",
    description:
      "Daily and scheduled cleaning for corporate offices, co-working spaces, and headquarters. We maintain the professional image your business deserves.",
    features: ["Desk & Workstation Sanitisation", "Breakroom & Kitchen", "Restroom Servicing"],
    image: "https://images.pexels.com/photos/4239031/pexels-photo-4239031.jpeg?auto=compress&cs=tinysrgb&w=600",
  },
  {
    title: "Commercial Building Cleaning",
    description:
      "End-to-end facility cleaning for shopping centres, warehouses, showrooms, and multi-tenanted commercial buildings of any scale.",
    features: ["Common Area Maintenance", "Floor Care & Polishing", "After-Hours Service"],
    image: "https://images.pexels.com/photos/4239035/pexels-photo-4239035.jpeg?auto=compress&cs=tinysrgb&w=600",
  },
  {
    title: "Industrial & Warehouse Cleaning",
    description:
      "Heavy-duty cleaning for factories, distribution centres, and industrial facilities. Equipment and protocols for high-safety environments.",
    features: ["High-Pressure Washing", "Machinery & Equipment Wipe-Down", "Hazard Compliant"],
    image: "https://images.pexels.com/photos/4107278/pexels-photo-4107278.jpeg?auto=compress&cs=tinysrgb&w=600",
  },
  {
    title: "Strata & Common Area Cleaning",
    description:
      "Keep lobbies, lifts, hallways, car parks, and shared amenities spotless for tenants, visitors, and residents.",
    features: ["Lobby & Reception", "Lift & Stairwell Cleaning", "Car Park Sweeping"],
    image: "https://images.pexels.com/photos/4239040/pexels-photo-4239040.jpeg?auto=compress&cs=tinysrgb&w=600",
  },
  {
    title: "Carpet & Floor Care",
    description:
      "Professional carpet steam cleaning, hard floor stripping, sealing, and polishing for corporate and commercial environments.",
    features: ["Steam & Hot Water Extraction", "Strip & Seal", "Scheduled Maintenance Plans"],
    image: "https://images.pexels.com/photos/4107120/pexels-photo-4107120.jpeg?auto=compress&cs=tinysrgb&w=600",
  },
  {
    title: "Deep Cleaning & Sanitisation",
    description:
      "Thorough detail cleaning of all surfaces, fixtures, and hard-to-reach areas. Kitchen, bathroom, and high-touch point sanitisation.",
    features: ["Surface Sanitisation", "Kitchen Deep Clean", "Bathroom Detail"],
    image: "https://images.pexels.com/photos/4239037/pexels-photo-4239037.jpeg?auto=compress&cs=tinysrgb&w=600",
  },
];

export function Services() {
  return (
    <section id="services" className="py-20 lg:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold text-[#0E9F6E] uppercase tracking-wider mb-3">
            Our Services
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4">
            Corporate & Commercial Cleaning
          </h2>
          <p className="text-[#4B5563] text-base leading-relaxed">
            Tailored cleaning programs for businesses of every size — from
            single-tenancy offices to multi-site commercial portfolios.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-7">
          {services.map((service) => (
            <div
              key={service.title}
              className="cleaning-card-hover bg-white rounded-2xl overflow-hidden border border-[#E5E7EB] group"
            >
              <div className="relative h-44 overflow-hidden bg-[#F1F5F9]">
                <img
                  src={service.image}
                  alt={service.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A]/60 to-transparent" />
                <h3 className="absolute bottom-4 left-5 right-5 text-lg font-bold text-white leading-snug">
                  {service.title}
                </h3>
              </div>

              <div className="p-6">
                <p className="text-[#4B5563] text-[0.9375rem] leading-relaxed mb-5">
                  {service.description}
                </p>

                <div className="flex flex-wrap gap-1.5 mb-5">
                  {service.features.map((f) => (
                    <span
                      key={f}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-[#F0FDF4] text-[#047857] border border-[#D1FAE5]"
                    >
                      {f}
                    </span>
                  ))}
                </div>

                <a
                  href="#contact"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0E9F6E] hover:text-[#047857] transition-colors"
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
