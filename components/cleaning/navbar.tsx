"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Menu,
  X,
  Phone,
} from "lucide-react";

const navLinks = [
  { label: "Home", href: "#home" },
  { label: "Services", href: "#services" },
  { label: "About", href: "#about" },
  { label: "Process", href: "#process" },
  { label: "Testimonials", href: "#testimonials" },
  { label: "Contact", href: "#contact" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-md shadow-lg"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <a href="#home" className="flex items-center gap-3">
            <Image
              src="/cleaning/logo.jpg"
              alt="ACS Logo"
              width={44}
              height={44}
              className="rounded-lg"
            />
            <div className="leading-tight">
              <span className="text-lg font-bold tracking-tight text-[#1B3A5C]">
                ACS
              </span>
              <span className="text-lg font-bold text-emerald-600">
                {" "}Cleaning
              </span>
              <p className="text-[10px] text-gray-400 font-medium tracking-wider uppercase">
                Allied Corporate Services
              </p>
            </div>
          </a>

          <div className="hidden lg:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-emerald-600 ${
                  scrolled ? "text-gray-600" : "text-gray-700"
                }`}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-4">
            <a
              href="tel:+61400000000"
              className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-emerald-600 transition-colors"
            >
              <Phone className="w-4 h-4" />
              1300 ACS CLN
            </a>
            <a href="#contact" className="cleaning-btn-primary text-sm !py-2.5 !px-5">
              Request a Quote
            </a>
          </div>

          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="w-6 h-6 text-gray-700" />
            ) : (
              <Menu className="w-6 h-6 text-gray-700" />
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-gray-100 shadow-xl">
          <div className="px-4 py-6 space-y-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-3 rounded-lg text-gray-700 font-medium hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-4 border-t border-gray-100">
              <a
                href="#contact"
                onClick={() => setMobileOpen(false)}
                className="cleaning-btn-primary w-full justify-center text-center"
              >
                Request a Quote
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
