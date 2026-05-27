"use client";

import Image from "next/image";
import {
  ArrowRight,
} from "lucide-react";

const services = [
  {
    title: "Office Cleaning",
    description:
      "Keep your workplace spotless and professional. Daily, weekly, or custom cleaning schedules to suit your business needs.",
    features: ["Desk & Surface Sanitisation", "Kitchen & Breakroom", "Restroom Deep Clean"],
    image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Residential Cleaning",
    description:
      "A sparkling home without the hassle. Our trained team delivers meticulous home cleaning you can rely on.",
    features: ["Regular Housekeeping", "Spring Cleaning", "Move In/Out Cleans"],
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Commercial Cleaning",
    description:
      "Large-scale cleaning solutions for retail spaces, warehouses, and commercial facilities of any size.",
    features: ["Floor Care & Polishing", "High-Traffic Areas", "After-Hours Service"],
    image: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Construction Cleaning",
    description:
      "Post-construction cleanup to make your new build or renovation ready for handover and occupancy.",
    features: ["Debris Removal", "Final Detail Clean", "Window & Glass Cleaning"],
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Carpet & Upholstery",
    description:
      "Deep cleaning for carpets, rugs, and upholstered furniture using professional-grade equipment.",
    features: ["Steam Cleaning", "Stain Removal", "Odour Treatment"],
    image: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Window Cleaning",
    description:
      "Crystal-clear windows inside and out. We handle residential and multi-storey commercial buildings.",
    features: ["Interior & Exterior", "High-Rise Capable", "Frame & Sill Cleaning"],
    image: "https://images.unsplash.com/photo-1527515637462-cee1dd5b9163?auto=format&fit=crop&w=600&q=80",
  },
];

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
          {services.map((service) => (
            <div
              key={service.title}
              className="cleaning-card-hover bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm group"
            >
              {/* Image */}
              <div className="relative h-48 overflow-hidden">
                <Image
                  src={service.image}
                  alt={service.title}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                <h3 className="absolute bottom-4 left-5 text-xl font-bold text-white">
                  {service.title}
                </h3>
              </div>

              {/* Content */}
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
                  Get a Quote
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
