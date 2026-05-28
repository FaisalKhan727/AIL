"use client";

import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Mitchell",
    role: "Facilities Director, Horizon Property Group",
    quote:
      "ACS has managed cleaning across our commercial portfolio for over 3 years. Their consistency, reporting, and responsiveness set them apart from every other provider we've used.",
    initials: "SM",
  },
  {
    name: "James Peterson",
    role: "Office Manager, TechBridge Solutions",
    quote:
      "Switching to ACS was the best operational decision we made this year. Our 3-floor office has never been cleaner, and their after-hours team is always professional and punctual.",
    initials: "JP",
  },
  {
    name: "Linda Chen",
    role: "Strata Manager, Prestige Living Group",
    quote:
      "ACS handles common area cleaning for 14 of our buildings. They're responsive, well-organised, and their quality audits give our owners corporation complete confidence.",
    initials: "LC",
  },
  {
    name: "David Okonkwo",
    role: "Operations Manager, Metro Health Group",
    quote:
      "For a healthcare facility, cleanliness is non-negotiable. ACS understands our strict infection control standards and consistently exceeds audit benchmarks.",
    initials: "DO",
  },
  {
    name: "Emma Whitfield",
    role: "Centre Manager, Westfield Retail Precinct",
    quote:
      "Managing a high-traffic retail centre requires a cleaning partner that can scale. ACS delivers round-the-clock coverage and handles peak-period surges without missing a beat.",
    initials: "EW",
  },
  {
    name: "Ryan Kapoor",
    role: "Head of Facilities, National Finance Corp",
    quote:
      "We needed a single provider for 8 offices nationally. ACS scaled up seamlessly, assigned a dedicated account manager, and the monthly KPI reports are exactly what our board expects.",
    initials: "RK",
  },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="py-20 lg:py-24 bg-[#F9FAFB]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold text-[#0E9F6E] uppercase tracking-wider mb-3">
            Client Testimonials
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4">
            Trusted by Leading Businesses
          </h2>
          <p className="text-[#4B5563] text-base leading-relaxed">
            Facility managers, strata companies, and corporate teams across
            Australia rely on ACS Cleaning.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((testimonial) => (
            <div key={testimonial.name} className="cleaning-testimonial-card">
              <div className="flex items-center gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-4 h-4 text-[#F59E0B] fill-[#F59E0B]"
                  />
                ))}
              </div>

              <div className="relative mb-6">
                <Quote className="absolute -top-1 -left-1 w-7 h-7 text-[#D1FAE5]" />
                <p className="relative text-[#4B5563] text-[0.9375rem] leading-relaxed pl-5">
                  {testimonial.quote}
                </p>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-[#E5E7EB]">
                <div className="w-10 h-10 rounded-full bg-[#0F172A] flex items-center justify-center text-white font-bold text-xs tracking-wide">
                  {testimonial.initials}
                </div>
                <div>
                  <p className="font-semibold text-[#0F172A] text-sm">
                    {testimonial.name}
                  </p>
                  <p className="text-xs text-[#6B7280]">{testimonial.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
