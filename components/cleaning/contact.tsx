"use client";

import { useState } from "react";
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  Send,
  CheckCircle2,
} from "lucide-react";

const contactInfo = [
  { icon: Phone, label: "Phone", value: "1300 ACS CLN", subtext: "Mon-Sat 7am - 7pm" },
  { icon: Mail, label: "Email", value: "info@acscleaning.com.au", subtext: "We respond within 2 hours" },
  { icon: MapPin, label: "Location", value: "Sydney, NSW", subtext: "Servicing all capital cities" },
  { icon: Clock, label: "Operations", value: "24/7 Service Available", subtext: "After-hours & emergency response" },
];

export function Contact() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 5000);
  };

  return (
    <section id="contact" className="py-20 lg:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-sm font-semibold text-[#0E9F6E] uppercase tracking-wider mb-3">Get in Touch</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#0F172A] mb-4">Request a Tailored Quote</h2>
          <p className="text-[#4B5563] text-base leading-relaxed">
            Tell us about your facility and requirements — we&apos;ll provide a detailed proposal and scope of work.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-10">
          <div className="lg:col-span-2 space-y-5">
            <div className="relative rounded-xl overflow-hidden h-44 mb-6 hidden lg:block bg-[#F1F5F9]">
              <img
                src="/cleaning/images/faucet-cleaning.jpg"
                alt="Detail cleaning"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0F172A]/80 to-[#0F172A]/20" />
              <div className="absolute bottom-4 left-5 right-5">
                <p className="text-white font-semibold text-[0.9375rem]">Let&apos;s discuss your needs</p>
                <p className="text-[#6EE7B7] text-sm">Free site assessment included</p>
              </div>
            </div>

            {contactInfo.map((item) => (
              <div key={item.label} className="flex items-start gap-4 p-4 bg-[#F9FAFB] rounded-xl border border-[#E5E7EB]">
                <div className="w-10 h-10 rounded-lg bg-[#D1FAE5] flex items-center justify-center flex-shrink-0">
                  <item.icon className="w-4.5 h-4.5 text-[#047857]" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-0.5">{item.label}</p>
                  <p className="font-semibold text-[#0F172A] text-[0.9375rem]">{item.value}</p>
                  <p className="text-sm text-[#6B7280]">{item.subtext}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-3">
            <div className="bg-[#F9FAFB] rounded-2xl p-7 border border-[#E5E7EB]">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-14 text-center space-y-4">
                  <div className="w-14 h-14 rounded-full bg-[#D1FAE5] flex items-center justify-center">
                    <CheckCircle2 className="w-7 h-7 text-[#047857]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#0F172A]">Thank You!</h3>
                  <p className="text-[#4B5563] max-w-sm">
                    We&apos;ve received your enquiry and will be in touch within one business day with a tailored proposal.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#374151] mb-1.5">Contact Name *</label>
                      <input type="text" required placeholder="Jane Smith" className="cleaning-input" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#374151] mb-1.5">Company / Organisation *</label>
                      <input type="text" required placeholder="Acme Corp Pty Ltd" className="cleaning-input" />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#374151] mb-1.5">Email Address *</label>
                      <input type="email" required placeholder="jane@company.com.au" className="cleaning-input" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#374151] mb-1.5">Phone Number</label>
                      <input type="tel" placeholder="0400 000 000" className="cleaning-input" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#374151] mb-1.5">Service Required *</label>
                    <select required className="cleaning-input" defaultValue="">
                      <option value="" disabled>Select a service</option>
                      <option>Office & Workplace Cleaning</option>
                      <option>Commercial Building Cleaning</option>
                      <option>Industrial & Warehouse Cleaning</option>
                      <option>Strata & Common Area Cleaning</option>
                      <option>Carpet & Floor Care</option>
                      <option>Deep Cleaning & Sanitisation</option>
                      <option>Multi-Site / Portfolio Contract</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#374151] mb-1.5">Project Details</label>
                    <textarea rows={4} placeholder="Describe your facility, compliance requirements, and preferred schedule..." className="cleaning-input resize-none" />
                  </div>
                  <button type="submit" className="cleaning-btn-primary w-full justify-center text-base mt-2">
                    <Send className="w-5 h-5" />
                    Submit Enquiry
                  </button>
                  <p className="text-xs text-[#9CA3AF] text-center pt-1">Your information is confidential and will never be shared with third parties.</p>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
