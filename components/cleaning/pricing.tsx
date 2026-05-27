"use client";

import { Check, Star, ArrowRight } from "lucide-react";

const plans = [
  {
    name: "Basic Clean",
    description: "Essential cleaning for small spaces",
    price: "From $99",
    period: "per visit",
    featured: false,
    features: [
      "General surface cleaning",
      "Vacuuming & mopping",
      "Kitchen & bathroom wipe-down",
      "Rubbish removal",
      "Eco-friendly products",
    ],
  },
  {
    name: "Professional",
    description: "Our most popular cleaning package",
    price: "From $199",
    period: "per visit",
    featured: true,
    features: [
      "Everything in Basic",
      "Deep kitchen & bathroom clean",
      "Window sill & frame cleaning",
      "Skirting board detail",
      "Appliance exterior cleaning",
      "Priority scheduling",
    ],
  },
  {
    name: "Premium",
    description: "Complete top-to-bottom deep clean",
    price: "From $349",
    period: "per visit",
    featured: false,
    features: [
      "Everything in Professional",
      "Inside oven & fridge cleaning",
      "Carpet steam cleaning",
      "Interior window cleaning",
      "Detailed cupboard cleaning",
      "Same-day availability",
      "Satisfaction guarantee",
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="py-24 cleaning-gradient-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-emerald-700">
              Pricing Plans
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Transparent, Competitive Pricing
          </h2>
          <p className="text-lg text-gray-600">
            Choose a plan that fits your needs. All prices are starting rates —
            we provide custom quotes based on your specific requirements.
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid md:grid-cols-3 gap-8 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`cleaning-pricing-card ${
                plan.featured ? "cleaning-pricing-featured" : ""
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 px-4 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-full shadow-lg">
                    <Star className="w-3.5 h-3.5 fill-current" />
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-xl font-bold text-gray-900 mb-1">
                  {plan.name}
                </h3>
                <p className="text-sm text-gray-500">{plan.description}</p>
              </div>

              <div className="mb-8">
                <span className="text-4xl font-extrabold text-gray-900">
                  {plan.price}
                </span>
                <span className="text-gray-500 ml-2">/{plan.period}</span>
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-600">{feature}</span>
                  </li>
                ))}
              </ul>

              <a
                href="#contact"
                className={`w-full justify-center ${
                  plan.featured
                    ? "cleaning-btn-primary"
                    : "cleaning-btn-secondary"
                }`}
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-gray-500 mt-10">
          All prices are in AUD and exclude GST. Custom quotes available for
          larger properties and ongoing contracts.
        </p>
      </div>
    </section>
  );
}
