"use client";

import { Phone, Mail, MapPin, Facebook, Instagram, Linkedin, ArrowUp } from "lucide-react";

const serviceLinks = [
  "Office & Workplace Cleaning",
  "Commercial Building Cleaning",
  "Industrial & Warehouse Cleaning",
  "Strata & Common Area Cleaning",
  "Post-Construction Cleaning",
  "Carpet & Floor Care",
];

const companyLinks = [
  { label: "About Us", href: "#about" },
  { label: "Our Services", href: "#services" },
  { label: "How We Work", href: "#process" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "Contact", href: "#contact" },
];

export function Footer() {
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <footer className="bg-[#0F172A] text-[#CBD5E1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-12">
        <div className="relative rounded-2xl overflow-hidden mb-16">
          <div className="absolute inset-0 cleaning-gradient" />
          <div className="relative p-10 sm:p-12 text-center space-y-5">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">Ready to Elevate Your Facility?</h2>
            <p className="text-base text-white/80 max-w-xl mx-auto">
              Get a free site assessment and tailored proposal for your corporate cleaning needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <a href="#contact" className="inline-flex items-center justify-center gap-2 bg-white text-[#047857] px-7 py-3 rounded-full font-semibold hover:bg-[#F0FDF4] transition-colors text-[0.9375rem]">
                Request a Proposal
              </a>
              <a href="tel:+61400000000" className="inline-flex items-center justify-center gap-2 border-2 border-white/30 text-white px-7 py-3 rounded-full font-semibold hover:bg-white/10 transition-colors text-[0.9375rem]">
                <Phone className="w-4 h-4" />
                Call Us Now
              </a>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div className="space-y-5">
            <a href="#home" className="flex items-center gap-3">
              <img src="/cleaning/logo.jpg" alt="ACS Logo" className="w-9 h-9 rounded-lg brightness-0 invert" />
              <div>
                <span className="text-lg font-bold text-white">ACS</span>
                <span className="text-lg font-bold text-[#34D399]"> Cleaning</span>
              </div>
            </a>
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              The corporate cleaning division of Allied Corporate Services — delivering facility cleaning solutions to businesses across Australia.
            </p>
            <div className="flex gap-2.5">
              {[Facebook, Instagram, Linkedin].map((Icon, i) => (
                <a key={i} href="#" className="w-9 h-9 rounded-lg bg-[#1E293B] hover:bg-[#047857] flex items-center justify-center transition-colors">
                  <Icon className="w-4 h-4 text-[#94A3B8]" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-white font-semibold text-[0.9375rem] mb-5">Services</h3>
            <ul className="space-y-2.5">
              {serviceLinks.map((link) => (
                <li key={link}><a href="#services" className="text-sm text-[#94A3B8] hover:text-[#34D399] transition-colors">{link}</a></li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold text-[0.9375rem] mb-5">Company</h3>
            <ul className="space-y-2.5">
              {companyLinks.map((link) => (
                <li key={link.label}><a href={link.href} className="text-sm text-[#94A3B8] hover:text-[#34D399] transition-colors">{link.label}</a></li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold text-[0.9375rem] mb-5">Contact</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Phone className="w-4 h-4 mt-0.5 text-[#34D399]" />
                <div><p className="text-sm text-[#CBD5E1]">1300 ACS CLN</p><p className="text-xs text-[#64748B]">Mon-Sat 7am-7pm</p></div>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="w-4 h-4 mt-0.5 text-[#34D399]" />
                <p className="text-sm text-[#CBD5E1]">info@acscleaning.com.au</p>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 mt-0.5 text-[#34D399]" />
                <div><p className="text-sm text-[#CBD5E1]">Sydney, NSW</p><p className="text-xs text-[#64748B]">Servicing all capital cities</p></div>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between pt-8 border-t border-[#1E293B] gap-4">
          <p className="text-sm text-[#64748B]">&copy; {new Date().getFullYear()} ACS Cleaning — Allied Corporate Services. All rights reserved.</p>
          <button onClick={scrollToTop} className="w-9 h-9 rounded-full bg-[#1E293B] hover:bg-[#047857] flex items-center justify-center transition-colors" aria-label="Scroll to top">
            <ArrowUp className="w-4 h-4 text-[#94A3B8]" />
          </button>
        </div>
      </div>
    </footer>
  );
}
