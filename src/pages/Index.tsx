import { useScrollReveal } from "@/hooks/useScrollReveal";
import HeroSection from "@/components/wedding/HeroSection";
import RsvpForm from "@/components/wedding/RsvpForm";
import LogisticsSection from "@/components/wedding/LogisticsSection";
import botanicalDivider from "@/assets/botanical-divider.png";

function RevealSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useScrollReveal();
  return <div ref={ref} className={className}>{children}</div>;
}

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav strip */}
      <nav className="sticky top-0 z-50 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="container max-w-6xl flex items-center justify-center gap-6 py-3">
          {["Bienvenida", "RSVP", "Logística"].map((label) => (
            <a
              key={label}
              href={`#${label === "Bienvenida" ? "hero" : label === "RSVP" ? "rsvp" : "logistics"}`}
              className="font-body text-xs md:text-sm uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors duration-200"
            >
              {label}
            </a>
          ))}
        </div>
      </nav>

      <main className="container max-w-6xl py-8 md:py-12">
        {/* Desktop: 3-column grid mirroring mockup */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Column 1 — Hero */}
          <div id="hero">
            <RevealSection>
              <HeroSection />
            </RevealSection>
          </div>

          {/* Column 2 — RSVP */}
          <div>
            <RevealSection>
              <RsvpForm />
            </RevealSection>
          </div>

          {/* Column 3 — Logistics */}
          <div id="logistics">
            <RevealSection>
              <LogisticsSection />
            </RevealSection>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center mt-12 pb-8">
          <img
            src={botanicalDivider}
            alt=""
            aria-hidden="true"
            className="mx-auto w-40 opacity-40 mb-4"
          />
          <p className="font-heading text-2xl text-accent italic">
            Inés &amp; Martín
          </p>
          <p className="font-body text-xs text-muted-foreground mt-1">
            26 · 09 · 2026
          </p>
        </footer>
      </main>
    </div>
  );
}
