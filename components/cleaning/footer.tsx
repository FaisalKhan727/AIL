"use client";

import Image from "next/image";
import {
  Phone,
  Mail,
  MapPin,
  Facebook,
  Instagram,
  Linkedin,
  ArrowUp,
} from "lucide-react";

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
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="bg-[#0F172A] text-gray-300">
      {/* CTA Banner */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="relative rounded-3xl overflow-hidden">
            <Image
              src="https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1400&q=80"
              alt="Modern corporate facility"
              fill
              className="object-cover"
            />
            <div className="absolute inset-0 cleaning-gradient opacity-90" />

            <div className="relative p-10 sm:p-14 text-center space-y-6">
              <h2 className="text-3xl sm:text-4xl font-bold text-white">
                Ready to Elevate Your Facility?
              </h2>
              <p className="text-lg text-emerald-100 max-w-2xl mx-auto">
                Get a free site assessment and tailored proposal for your
                corporate cleaning needs.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <a
                  href="#contact"
                  className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 px-8 py-3.5 rounded-full font-semibold hover:bg-emerald-50 transition-colors shadow-lg"
                >
                  Request a Proposal
                </a>
                <a
                  href="tel:+61400000000"
                  className="inline-flex items-center justify-center gap-2 border-2 border-white/30 text-white px-8 py-3.5 rounded-full font-semibold hover:bg-white/10 transition-colors"
                >
                  <Phone className="w-5 h-5" />
                  Call Us Now
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div className="space-y-5">
            <a href="#home" className="flex items-center gap-3">
              <Image
                src="/cleaning/logo.jpg"
                alt="ACS Logo"
                width={40}
                height={40}
                className="rounded-lg brightness-0 invert"
              />
              <div>
                <span className="text-xl font-bold text-white">ACS</span>
                <span className="text-xl font-bold text-emerald-400">
                  {" "}Cleaning
                </span>
              </div>
            </a>
            <p className="text-sm text-gray-400 leading-relaxed">
              The corporate cleaning division of Allied Corporate Services —
              delivering facility cleaning solutions to businesses across
              Australia.
            </p>
            <div className="flex gap-3">
              {[Facebook, Instagram, Linkedin].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-10 h-10 rounded-lg bg-white/5 hover:bg-emerald-600 flex items-center justify-center transition-colors"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-5">Services</h3>
            <ul className="space-y-3">
              {serviceLinks.map((link) => (
                <li key={link}>
                  <a
                    href="#services"
                    className="text-sm text-gray-400 hover:text-emerald-400 transition-colors"
                  >
                    {link}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-5">Company</h3>
            <ul className="space-y-3">
              {companyLinks.map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-emerald-400 transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-white font-semibold mb-5">Contact</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Phone className="w-4 h-4 mt-1 text-emerald-400" />
                <div>
                  <p className="text-sm">1300 ACS CLN</p>
                  <p className="text-xs text-gray-500">Mon-Sat 7am-7pm</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="w-4 h-4 mt-1 text-emerald-400" />
                <p className="text-sm">info@acscleaning.com.au</p>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-4 h-4 mt-1 text-emerald-400" />
                <div>
                  <p className="text-sm">Sydney, NSW</p>
                  <p className="text-xs text-gray-500">
                    Servicing all capital cities
                  </p>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between pt-8 border-t border-white/10 gap-4">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} ACS Cleaning — Allied Corporate
            Services. All rights reserved.
          </p>
          <button
            onClick={scrollToTop}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-emerald-600 flex items-center justify-center transition-colors"
            aria-label="Scroll to top"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </footer>
  );
}
