import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import couplePhoto from "@/assets/couple-photo.jpg";
import botanicalCorner from "@/assets/botanical-corner.png";

export default function LogisticsSection() {
  return (
    <section className="space-y-6">
      {/* Logistics */}
      <div className="wedding-card p-6 md:p-10 relative overflow-hidden">
        <img
          src={botanicalCorner}
          alt=""
          aria-hidden="true"
          className="absolute top-0 right-0 w-24 opacity-50 pointer-events-none -scale-x-100"
        />

        <h2 className="section-title mb-6">Logística</h2>

        {/* Alojamiento */}
        <div className="mb-6">
          <h3 className="font-heading text-xl text-primary font-medium mb-2">
            🏨 Alojamiento
          </h3>
          <p className="font-body text-sm text-foreground leading-relaxed">
            Hemos reservado habitaciones en el{" "}
            <strong>Hotel Rural La Encina</strong> con un precio especial para
            nuestros invitados. Menciona el código{" "}
            <span className="font-semibold text-primary">INÉSYMARTÍN</span> al
            reservar.
          </p>
          <p className="font-body text-sm text-muted-foreground mt-2">
            También recomendamos <strong>Hostal del Valle</strong> — a 5 minutos
            de la finca. Código descuento:{" "}
            <span className="font-semibold text-primary">BODA2026</span>.
          </p>
        </div>

        {/* Transport */}
        <div className="mb-6">
          <h3 className="font-heading text-xl text-primary font-medium mb-2">
            🚌 Transporte y Parking
          </h3>
          <p className="font-body text-sm text-foreground leading-relaxed">
            Habrá un autobús de ida y vuelta desde el centro de Madrid:
          </p>
          <ul className="font-body text-sm text-foreground mt-2 space-y-1 list-disc list-inside">
            <li>Ida: 11:30 h — Plaza de España</li>
            <li>Vuelta: 01:00 h y 03:00 h</li>
          </ul>
          <p className="font-body text-sm text-muted-foreground mt-2">
            La finca dispone de parking gratuito para los que vengan en coche.
          </p>
        </div>

        {/* Dress code */}
        <div className="mb-2">
          <h3 className="font-heading text-xl text-primary font-medium mb-2">
            👔 Código de vestimenta
          </h3>
          <p className="font-body text-sm text-foreground">
            Etiqueta formal / Traje oscuro
          </p>
        </div>
      </div>

      {/* Nuestra Historia */}
      <div className="wedding-card p-6 md:p-10">
        <h2 className="section-title mb-4">Nuestra Historia</h2>
        <p className="font-body text-sm text-foreground leading-relaxed mb-6">
          Dicen que las mejores historias son las que no te esperas. La nuestra
          comenzó un día cualquiera, entre cafés, risas y conversaciones que no
          queríamos que terminaran. Desde aquel momento supimos que lo nuestro
          era para siempre, y ahora queremos celebrarlo con todos vosotros.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg overflow-hidden shadow-sm aspect-square">
            <img
              src={couplePhoto}
              alt="Inés y Martín"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="rounded-lg overflow-hidden shadow-sm aspect-square bg-muted flex items-center justify-center">
            <span className="font-body text-xs text-muted-foreground">
              Foto próximamente
            </span>
          </div>
          <div className="rounded-lg overflow-hidden shadow-sm aspect-square bg-muted flex items-center justify-center">
            <span className="font-body text-xs text-muted-foreground">
              Foto próximamente
            </span>
          </div>
          <div className="rounded-lg overflow-hidden shadow-sm aspect-square">
            <img
              src={couplePhoto}
              alt="Inés y Martín"
              className="w-full h-full object-cover object-top"
            />
          </div>
        </div>
      </div>

      {/* Regalos */}
      <div className="wedding-card p-6 md:p-10">
        <h2 className="section-title mb-4">🎁 Regalos</h2>
        <p className="font-body text-sm text-foreground leading-relaxed mb-3">
          El mejor regalo eres tú, pero si deseas hacernos un detalle, podéis
          contribuir a nuestro viaje de novios:
        </p>
        <div className="bg-muted rounded-lg p-4 text-center">
          <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">
            IBAN
          </p>
          <p className="font-heading text-lg text-foreground tracking-wide">
            ESXX XXXX XXXX XXXX XXXX
          </p>
        </div>
      </div>

      {/* FAQ */}
      <div className="wedding-card p-6 md:p-10">
        <h2 className="section-title mb-4">Preguntas Frecuentes (FAQ)</h2>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="q1">
            <AccordionTrigger className="font-body text-sm text-left">
              ¿Puedo llevar acompañante que no esté en la invitación o niños?
            </AccordionTrigger>
            <AccordionContent className="font-body text-sm text-muted-foreground">
              Nos encantaría invitar a todo el mundo, pero por limitaciones de aforo nuestra boda será más íntima. Nos ceñiremos estrictamente a las personas que aparecen en la invitación. ¡Aprovecha para disfrutar de una noche libre de responsabilidades!
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q2">
            <AccordionTrigger className="font-body text-sm text-left">
              ¿Cuál es el código de vestimenta exacto?
            </AccordionTrigger>
            <AccordionContent className="font-body text-sm text-muted-foreground">
              Etiqueta formal o traje oscuro. Pero sobre todo, ¡venid guapos y con zapatos cómodos para darlo todo en la pista de baile! (Eso sí, dejad el blanco para la novia, por favor 😉).
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q3">
            <AccordionTrigger className="font-body text-sm text-left">
              ¿Hay opciones de menú para intolerancias o alergias?
            </AccordionTrigger>
            <AccordionContent className="font-body text-sm text-muted-foreground">
              ¡Por supuesto! Queremos que todos disfrutéis del banquete de forma segura. Por favor, indícanos cualquier alergia, intolerancia o dieta especial en el formulario de asistencia y el catering se encargará del resto.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </section>
  );
}
