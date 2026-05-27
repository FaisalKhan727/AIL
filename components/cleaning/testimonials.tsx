"use client";

import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Mitchell",
    role: "Property Manager, Horizon Realty",
    quote:
      "ACS Cleaning has been managing our commercial properties for over 3 years. Their consistency and attention to detail is outstanding. I wouldn't trust anyone else.",
    rating: 5,
    initials: "SM",
  },
  {
    name: "James Peterson",
    role: "Office Manager, TechBridge Solutions",
    quote:
      "Switching to ACS was the best decision we made. Our office has never been cleaner, and their team is always professional and punctual. Highly recommend!",
    rating: 5,
    initials: "JP",
  },
  {
    name: "Linda Chen",
    role: "Homeowner, Sydney",
    quote:
      "I've tried many cleaning services, but ACS Cleaning is on another level. They use eco-friendly products and leave my home absolutely spotless every time.",
    rating: 5,
    initials: "LC",
  },
  {
    name: "David Okonkwo",
    role: "Facilities Director, Metro Health",
    quote:
      "For a healthcare facility, cleanliness is non-negotiable. ACS understands our strict hygiene standards and consistently exceeds expectations.",
    rating: 5,
    initials: "DO",
  },
  {
    name: "Emma Whitfield",
    role: "Restaurant Owner, The Garden Plate",
    quote:
      "After-hours deep cleaning that's thorough and reliable — exactly what our restaurant needs. The ACS team has been incredible to work with.",
    rating: 5,
    initials: "EW",
  },
  {
    name: "Ryan Kapoor",
    role: "Strata Manager",
    quote:
      "ACS handles common area cleaning for 12 of our buildings. They're responsive, well-organised, and their quality never drops. Great communication too.",
    rating: 5,
    initials: "RK",
  },
];

export function Testimonials() {
  return (
    <section id="testimonials" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-emerald-700">
              Client Testimonials
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            What Our Clients Say
          </h2>
          <p className="text-lg text-gray-600">
            Don&apos;t just take our word for it. Here&apos;s what businesses and
            homeowners across Australia have to say.
          </p>
        </div>

        {/* Testimonials grid */}
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
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
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
