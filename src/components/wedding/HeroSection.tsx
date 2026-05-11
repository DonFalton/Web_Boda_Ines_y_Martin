import { useState, useEffect } from "react";
// ACTUALIZADO: Ya no importamos heroVenue
import botanicalCorner from "@/assets/botanical-corner.png";
import fotoPareja from "@/assets/foto_portada_web.webp";
import fotoLogistica from "@/assets/TE_QUEREMOS_EN_BODA.webp";

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

export default function HeroSection({ onRsvpClick }: { onRsvpClick: () => void }) {
  const weddingDate = new Date("2026-09-26T12:00:00");
  const { days, hours, minutes, seconds } = useCountdown(weddingDate);

  // Pre-cargar la imagen para evitar el parpadeo
  useEffect(() => {
    const img = new Image();
    img.src = fotoLogistica;
  }, []);

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

        {/* Names & "¡Nos casamos!" */}
        <div className="text-center pt-8 md:pt-12 pb-2 relative z-10 mb-6 border-b border-border/50">
          <h1
            className="font-heading text-5xl md:text-7xl font-light text-accent italic"
            style={{ lineHeight: "1.1" }}
          >
            Inés <span className="text-4xl md:text-6xl">&</span> Martín
          </h1>
          <p className="font-heading text-xl md:text-2xl text-foreground mt-2 mb-6">
            ¡Nos casamos!
          </p>
        </div>

        {/* ACTUALIZADO: Vuestra foto ocupa el lugar de la finca, a ancho completo y sin rotación */}
        <div className="my-6 rounded-lg overflow-hidden shadow-xl border border-border/50">
          <img
            src={fotoPareja}
            alt="Inés y Martín, ¡nos casamos!"
            className="w-full h-auto object-cover"
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
            <p className="text-sm text-muted-foreground mb-1">
              Finca "Las Buenas Costumbres"
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Carretera de Peguerinos al Alto del León km 1, <br /> 05239 Peguerinos, Ávila <br /> Tel: 622 27 26 45
            </p>
            <div className="rounded-lg overflow-hidden border border-border aspect-video bg-muted flex items-center justify-center">
              <iframe
                title="Ubicación de la boda"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3027.7297618332404!2d-4.227895723915379!3d40.63584127140525!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0xd4109117ad842bb%3A0x5b25e8561fd40474!2sLas%20Buenas%20Costumbres!5e0!3m2!1ses!2ses!4v1774153059948!5m2!1ses!2ses"
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

          <button onClick={onRsvpClick} className="btn-burgundy mt-8 inline-block px-10 py-4 shadow-lg text-lg">
            Ver el Plan del Fin de Semana
          </button>
        </div>
      </div>
    </section>
  );
}