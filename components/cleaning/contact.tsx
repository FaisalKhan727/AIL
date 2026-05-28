"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  Send,
  CheckCircle2,
} from "lucide-react";

const contactInfo = [
  {
    icon: Phone,
    label: "Phone",
    value: "1300 ACS CLN",
    subtext: "Mon-Sat 7am - 7pm",
  },
  {
    icon: Mail,
    label: "Email",
    value: "info@acscleaning.com.au",
    subtext: "We respond within 2 hours",
  },
  {
    icon: MapPin,
    label: "Location",
    value: "Sydney, NSW",
    subtext: "Servicing all capital cities",
  },
  {
    icon: Clock,
    label: "Operations",
    value: "24/7 Service Available",
    subtext: "After-hours & emergency response",
  },
];

export function Contact() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 5000);
  };

  return (
    <section id="contact" className="py-24 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 rounded-full mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-medium text-emerald-700">
              Get in Touch
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Request a Tailored Quote
          </h2>
          <p className="text-lg text-gray-600">
            Tell us about your facility and requirements — we&apos;ll provide a
            detailed proposal and scope of work.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-12">
          <div className="lg:col-span-2 space-y-6">
            <div className="relative rounded-2xl overflow-hidden h-48 mb-8 hidden lg:block">
              <Image
                src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=600&q=80"
                alt="Our corporate team"
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A]/80 to-[#0F172A]/20" />
              <div className="absolute bottom-4 left-5 right-5">
                <p className="text-white font-semibold">Let&apos;s discuss your needs</p>
                <p className="text-emerald-300 text-sm">Free site assessment included</p>
              </div>
            </div>

            {contactInfo.map((item) => (
              <div
                key={item.label}
                className="flex items-start gap-4 p-5 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                    {item.label}
                  </p>
                  <p className="font-semibold text-gray-900">{item.value}</p>
                  <p className="text-sm text-gray-500">{item.subtext}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Thank You!
                  </h3>
                  <p className="text-gray-600 max-w-sm">
                    We&apos;ve received your enquiry and will be in touch within
                    one business day with a tailored proposal.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Contact Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Jane Smith"
                        className="cleaning-input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Company / Organisation *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Acme Corp Pty Ltd"
                        className="cleaning-input"
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="jane@company.com.au"
                        className="cleaning-input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        placeholder="0400 000 000"
                        className="cleaning-input"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Service Required *
                    </label>
                    <select required className="cleaning-input" defaultValue="">
                      <option value="" disabled>
                        Select a service
                      </option>
                      <option>Office & Workplace Cleaning</option>
                      <option>Commercial Building Cleaning</option>
                      <option>Industrial & Warehouse Cleaning</option>
                      <option>Strata & Common Area Cleaning</option>
                      <option>Post-Construction Cleaning</option>
                      <option>Carpet & Floor Care</option>
                      <option>Multi-Site / Portfolio Contract</option>
                      <option>Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Project Details
                    </label>
                    <textarea
                      rows={4}
                      placeholder="Describe your facility (size, floors, current frequency), any compliance requirements, and preferred schedule..."
                      className="cleaning-input resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="cleaning-btn-primary w-full justify-center text-base"
                  >
                    <Send className="w-5 h-5" />
                    Submit Enquiry
                  </button>

                  <p className="text-xs text-gray-400 text-center">
                    Your information is confidential and will never be shared
                    with third parties.
                  </p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
