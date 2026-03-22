import { useState, useEffect } from "react";
import heroVenue from "@/assets/hero-venue.jpg";
import botanicalCorner from "@/assets/botanical-corner.png";

function useCountdown(targetDate: Date) {
  const [timeLeft, setTimeLeft] = useState(getTimeLeft(targetDate));

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(getTimeLeft(targetDate)), 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  return timeLeft;
}

function getTimeLeft(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function HeroSection() {
  const weddingDate = new Date("2026-09-26T12:00:00");
  const { days, hours, minutes, seconds } = useCountdown(weddingDate);

  const scrollToRsvp = () => {
    document.getElementById("rsvp")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="relative">
      <div className="wedding-card relative p-6 md:p-10">
        {/* Botanical corner decorations */}
        <img
          src={botanicalCorner}
          alt=""
          aria-hidden="true"
          className="absolute top-0 left-0 w-28 md:w-40 opacity-70 pointer-events-none"
        />
        <img
          src={botanicalCorner}
          alt=""
          aria-hidden="true"
          className="absolute bottom-0 right-0 w-28 md:w-40 opacity-70 pointer-events-none rotate-180"
        />

        {/* Names */}
        <div className="text-center pt-8 md:pt-12 pb-4 relative z-10">
          <h1
            className="font-heading text-5xl md:text-7xl font-light text-accent italic"
            style={{ lineHeight: "1.1" }}
          >
            Inés <span className="text-4xl md:text-6xl">&amp;</span> Martín
          </h1>
          <p className="font-heading text-xl md:text-2xl text-foreground mt-2">
            ¡Nos casamos!
          </p>
        </div>

        {/* Hero image */}
        <div className="my-6 rounded-lg overflow-hidden shadow-md">
          <img
            src={heroVenue}
            alt="Finca donde se celebrará la boda"
            className="w-full h-48 md:h-72 object-cover"
          />
        </div>

        {/* Date & Location */}
        <div className="text-center space-y-3 relative z-10">
          <h2 className="section-title">¿Qué, Cuándo y Dónde?</h2>
          <p className="font-heading text-lg md:text-xl text-foreground">
            Sábado, 26 de septiembre de 2026
          </p>

          {/* Map placeholder */}
          <div className="my-4">
            <p className="form-label text-center mb-1">Ubicación</p>
            <p className="text-sm text-muted-foreground mb-3">
              Google Maps · Finca La Esperanza, Camino Rural s/n, Madrid
            </p>
            <div className="rounded-lg overflow-hidden border border-border aspect-video bg-muted flex items-center justify-center">
              <iframe
                title="Ubicación de la boda"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3037.668!2d-3.7038!3d40.4168!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDDCsDI1JzAwLjUiTiAzwrA0MicxMy43Ilc!5e0!3m2!1ses!2ses!4v1234567890"
                className="w-full h-full min-h-[180px]"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          {/* Countdown */}
          <div className="pt-4">
            <p className="form-label text-center">Cuenta Atrás</p>
            <div className="flex justify-center gap-3 mt-2">
              {[
                { value: days, label: "Días" },
                { value: hours, label: "Hrs" },
                { value: minutes, label: "Min" },
                { value: seconds, label: "Seg" },
              ].map(({ value, label }) => (
                <div key={label} className="countdown-box">
                  <span className="leading-none">{pad(value)}</span>
                  <span className="text-xs font-body font-light opacity-80">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={scrollToRsvp} className="btn-burgundy mt-6 inline-block">
            Confirma Asistencia
          </button>
        </div>
      </div>
    </section>
  );
}
