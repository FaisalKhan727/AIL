"use client";

import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Mitchell",
    role: "Facilities Director, Horizon Property Group",
    quote:
      "ACS has managed cleaning across our commercial portfolio for over 3 years. Their consistency, reporting, and responsiveness set them apart from every other provider we've used.",
    rating: 5,
    initials: "SM",
  },
  {
    name: "James Peterson",
    role: "Office Manager, TechBridge Solutions",
    quote:
      "Switching to ACS was the best operational decision we made this year. Our 3-floor office has never been cleaner, and their after-hours team is always professional and punctual.",
    rating: 5,
    initials: "JP",
  },
  {
    name: "Linda Chen",
    role: "Strata Manager, Prestige Living Group",
    quote:
      "ACS handles common area cleaning for 14 of our buildings. They're responsive, well-organised, and their quality audits give our owners corporation complete confidence.",
    rating: 5,
    initials: "LC",
  },
  {
    name: "David Okonkwo",
    role: "Operations Manager, Metro Health Group",
    quote:
      "For a healthcare facility, cleanliness is non-negotiable. ACS understands our strict infection control standards and consistently exceeds audit benchmarks.",
    rating: 5,
    initials: "DO",
  },
  {
    name: "Emma Whitfield",
    role: "Centre Manager, Westfield Retail Precinct",
    quote:
      "Managing a high-traffic retail centre requires a cleaning partner that can scale. ACS delivers round-the-clock coverage and handles peak-period surges without missing a beat.",
    rating: 5,
    initials: "EW",
  },
  {
    name: "Ryan Kapoor",
    role: "Head of Facilities, National Finance Corp",
    quote:
      "We needed a single provider for 8 offices nationally. ACS scaled up seamlessly, assigned a dedicated account manager, and the monthly KPI reports are exactly what our board expects.",
    rating: 5,
    initials: "RK",
  },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-emerald-700">
              Client Testimonials
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Trusted by Leading Businesses
          </h2>
          <p className="text-lg text-gray-600">
            Facility managers, strata companies, and corporate teams across
            Australia rely on ACS Cleaning.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial) => (
            <div key={testimonial.name} className="cleaning-testimonial-card">
              <div className="flex items-center gap-1 mb-4">
                {Array.from({ length: testimonial.rating }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 text-amber-400 fill-amber-400"
                  />
                ))}
              </div>

              <div className="relative mb-6">
                <Quote className="absolute -top-1 -left-1 w-8 h-8 text-emerald-100" />
                <p className="relative text-gray-600 leading-relaxed pl-6">
                  {testimonial.quote}
                </p>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#1B3A5C] to-[#0F172A] flex items-center justify-center text-white font-bold text-sm">
                  {testimonial.initials}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">
                    {testimonial.name}
                  </p>
                  <p className="text-xs text-gray-500">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
