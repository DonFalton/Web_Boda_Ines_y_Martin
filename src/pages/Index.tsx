import { useState, useEffect } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import HeroSection from "@/components/wedding/HeroSection";
import RsvpForm from "@/components/wedding/RsvpForm";
import LogisticsSection from "@/components/wedding/LogisticsSection";
import botanicalDivider from "@/assets/botanical-divider.webp";
// NUEVO: Importamos la foto divertida
import teQueremosImg from "@/assets/TE_QUEREMOS_EN_BODA.webp";

function RevealSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useScrollReveal();
  return <div ref={ref} className={className}>{children}</div>;
}

export default function Index() {
  // Estado para controlar qué "pantalla" estamos viendo
  const [activeTab, setActiveTab] = useState("hero");

  // ESTADOS DEL EASTER EGG 🕵️‍♂️
  const [footerClicks, setFooterClicks] = useState(0);
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  // Efecto mágico: al cambiar de pestaña, hace scroll suave hacia arriba automáticamente
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  // Función secreta que cuenta los clicks
  const handleFooterClick = () => {
    if (!showEasterEgg) {
      const newCount = footerClicks + 1;
      setFooterClicks(newCount);
      if (newCount === 5) {
        setShowEasterEgg(true);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* EL NUEVO MENÚ (Embudo de conversión: Bienvenida -> Detalles -> RSVP) */}
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border/50 shadow-sm">
        <div className="container max-w-4xl flex items-center justify-center gap-4 md:gap-8 py-4">
          {[
            { id: "hero", label: "Bienvenida" },
            { id: "logistics", label: "Detalles del Plan" },
            { id: "rsvp", label: "Confirmación" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`font-body text-[10px] md:text-xs uppercase tracking-widest transition-all duration-300 ${activeTab === tab.id
                ? "text-[#6B2D3A] font-bold border-b-2 border-[#6B2D3A] pb-1"
                : "text-muted-foreground hover:text-[#B89947]"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Contenedor Principal */}
      <main className="container max-w-3xl flex-grow py-8 md:py-12 flex flex-col justify-center">

        {/* PANTALLA 1: PORTADA */}
        {activeTab === "hero" && (
          <RevealSection>
            {/* Le decimos a la portada que su botón ahora debe llevar a LOGÍSTICA */}
            <HeroSection onRsvpClick={() => setActiveTab("logistics")} />
          </RevealSection>
        )}

        {/* PANTALLA 2: DETALLES / LOGÍSTICA (La Venta del Plan) */}
        {activeTab === "logistics" && (
          <RevealSection>
            <div className="mb-6 text-center md:text-left">
              <button
                onClick={() => setActiveTab("hero")}
                className="text-sm font-body text-muted-foreground hover:text-[#B89947] transition-colors"
              >
                ← Volver a Inicio
              </button>
            </div>

            <LogisticsSection />

            {/* EL GRAN BOTÓN DE CIERRE (Call to Action final después de leer lo chulo que es el plan) */}
            <div className="text-center mt-12 pt-8 border-t border-border/50">
              <h3 className="font-heading text-2xl text-[#6B2D3A] italic mb-6">
                ¿Te apuntas?
              </h3>

              {/* NUEVO: LA FOTO DIVERTIDA (Ahora encima del botón) */}
              <div className="mb-8 mx-auto max-w-[280px] md:max-w-sm rounded-xl overflow-hidden shadow-xl border-4 border-white rotate-[-2deg] hover:rotate-0 transition-transform duration-300">
                <img
                  src={teQueremosImg}
                  alt="¡Te queremos en nuestra boda!"
                  className="w-full h-auto object-cover"
                />
              </div>

              <button
                onClick={() => setActiveTab("rsvp")}
                className="bg-[#6B2D3A] hover:bg-[#52222c] text-white px-10 py-4 rounded-md uppercase tracking-widest text-sm transition-colors shadow-lg w-full md:w-auto font-bold relative z-10"
              >
                ¡Me encanta el plan! Confirmar Asistencia
              </button>
            </div>
          </RevealSection>
        )}

        {/* PANTALLA 3: RSVP (El Cierre Final) */}
        {activeTab === "rsvp" && (
          <RevealSection>
            <div className="mb-6 text-center md:text-left">
              <button
                onClick={() => setActiveTab("logistics")}
                className="text-sm font-body text-muted-foreground hover:text-[#B89947] transition-colors"
              >
                ← Volver a los Detalles
              </button>
            </div>
            <RsvpForm />
          </RevealSection>
        )}
      </main>

      {/* Footer (Siempre visible abajo) - AHORA CON EASTER EGG PRECISO */}
      <footer className="text-center mt-auto pb-8 pt-12">
        <img
          src={botanicalDivider}
          alt=""
          aria-hidden="true"
          className="mx-auto w-64 md:w-80 opacity-40 mb-4 pointer-events-none"
        />

        {/* LA ZONA SECRETA (Solo vuestros nombres) */}
        <p
          onClick={handleFooterClick}
          className="font-heading text-2xl text-accent italic hover:scale-105 transition-transform duration-300 cursor-pointer select-none inline-block px-4 py-2"
        >
          Inés &amp; Martín
        </p>

        <p className="font-body text-xs text-muted-foreground mt-1 pointer-events-none">
          26 · 09 · 2026
        </p>

        {/* EL MENSAJE SECRETO */}
        {showEasterEgg && (
          <div className="mt-8 p-5 max-w-sm mx-auto bg-muted/40 rounded-xl border border-border/50 animate-in zoom-in fade-in slide-in-from-bottom-4 duration-700 shadow-md">
            <p className="font-body text-base text-[#6B2D3A] font-medium mb-2">
              🕵️‍♂️ ¡Vaya, vaya! Tenemos a un cotilla en la sala...
            </p>
            <p className="font-body text-sm text-foreground mb-4 leading-relaxed">
              Ya que te gusta investigar cada rincón de la web y has encontrado nuestro escondite secreto, te dejamos aquí un mapa del tesoro (para nuestra luna de miel en Japón 🍣):
            </p>
            <div className="bg-white p-4 rounded-lg border border-[#B89947]/40 shadow-sm cursor-text select-text">
              <p className="font-body text-[10px] text-[#B89947] uppercase tracking-widest font-bold mb-2">
                IBAN SECRETO
              </p>
              <p className="font-heading text-base md:text-lg text-foreground font-medium tracking-wider">
                ES53 2100 2867 4102 1019 4981
              </p>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}