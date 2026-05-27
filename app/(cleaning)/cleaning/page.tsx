"use client";

import { Navbar } from "@/components/cleaning/navbar";
import { Hero } from "@/components/cleaning/hero";
import { Services } from "@/components/cleaning/services";
import { About } from "@/components/cleaning/about";
import { WhyChooseUs } from "@/components/cleaning/why-choose-us";
import { Process } from "@/components/cleaning/process";
import { Pricing } from "@/components/cleaning/pricing";
import { Testimonials } from "@/components/cleaning/testimonials";
import { Contact } from "@/components/cleaning/contact";
import { Footer } from "@/components/cleaning/footer";

export default function CleaningPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Services />
      <About />
      <WhyChooseUs />
      <Process />
      <Pricing />
      <Testimonials />
      <Contact />
      <Footer />
    </main>
  );
}
