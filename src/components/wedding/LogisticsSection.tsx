import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import botanicalCorner from "@/assets/botanical-corner.png";

export default function LogisticsSection() {
  return (
    <section className="space-y-6">

      {/* 1. EL PLAN DEL FIN DE SEMANA */}
      <div className="wedding-card p-6 md:p-10 relative overflow-hidden">
        <img
          src={botanicalCorner}
          alt=""
          aria-hidden="true"
          className="absolute top-0 right-0 w-24 opacity-50 pointer-events-none -scale-x-100"
        />

        <h2 className="section-title mb-6">Un Fin de Semana Juntos</h2>
        <p className="font-body text-sm text-foreground leading-relaxed mb-6">
          La idea de celebrar nuestra boda nace de algo muy sencillo: poder disfrutar con todos vosotros de un momento tan especial. Sabemos que el tiempo vuela y que unas pocas horas se nos quedarían cortas después del esfuerzo que hacéis por acompañarnos.
          <br /><br />
          Por eso, queremos que podáis disfrutar de un fin de semana de fiesta y desconexión, desde la <strong>tarde del viernes 25 de septiembre hasta la mañana del domingo 27</strong>. Serán unos días para reír, celebrar y emocionarnos. ¡Os esperamos con muchas ganas!
        </p>

        {/* El Itinerario */}
        <div className="mb-6 bg-muted/30 p-5 rounded-lg border border-border/50">
          <h3 className="font-heading text-xl text-[#6B2D3A] font-medium mb-4">
            🗓️ El Itinerario
          </h3>
          <ul className="space-y-4 font-body text-sm text-foreground">

            <li className="flex items-start">
              <span className="text-xl mr-3">🔥</span>
              <div>
                <strong className="block text-primary">Viernes 25 (Tarde/Noche): La Pre-Boda</strong>
                Para quienes queráis acompañarnos desde el viernes, daremos el pistoletazo de salida en la finca para empezar el fin de semana juntos. Habrá barbacoa, bebida y muchas ganas de veros.
                <br />
                <em>Dress Code:</em> <strong>Outfit hortera o pijama.</strong> Cualquier look que no te pondrías en una boda… ¡es más que bienvenido! Cuanto más cuestionable el modelito, mejor 🕺.
              </div>
            </li>

            <li className="flex items-start">
              <span className="text-xl mr-3">💍</span>
              <div>
                <strong className="block text-primary text-lg">Sábado 26: El Gran Día (El Plato Fuerte)</strong>
                El sábado celebraremos el gran día… ¡y aquí sí que no hay excusa! 😉
                <ul className="mt-2 space-y-1 ml-2 border-l-2 border-primary/20 pl-3">
                  <li><strong>09:00h (aprox)</strong> - Desayuno conjunto para los que amanezcamos en la finca.</li>
                  <li><strong>13:00h</strong> - Ceremonia. Daremos el "Sí, quiero" rodeados de naturaleza.</li>
                  <li><strong>14:00h</strong> - Cóctel. Primeros brindis y picoteo.</li>
                  <li><strong>15:00h</strong> - Banquete. Comida rica, vino generoso y algún discurso al que habrá que sobrevivir 😜.</li>
                  <li><strong>Tarde/Noche</strong> - Baile, barra libre y cero dignidad. Hasta que el cuerpo aguante. P.D: que el último apague la luz.</li>
                </ul>
              </div>
            </li>

            <li className="flex items-start">
              <span className="text-xl mr-3">☕</span>
              <div>
                <strong className="block text-primary">Domingo 27 (Mañana): Resaca y Despedida</strong>
                Para los supervivientes que se hayan quedado a dormir, tendremos un desayuno de campeones para reponer energías, comentar las anécdotas de la noche y poner el broche de oro al fin de semana.
                <br /><br />
                <em>Tip:</em> <strong>¡En la finca hay piscina! 🏊‍♂️</strong> Si el tiempo acompaña y sois valientes, traed el bañador por si cae un chapuzón de despedida.
              </div>
            </li>

          </ul>
        </div>

        {/* El Alojamiento */}
        <div className="mb-6 bg-muted/30 p-4 rounded-lg border border-border/50">
          <h3 className="font-heading text-xl text-[#6B2D3A] font-medium mb-2">
            🏨 Vuestra cama a un paso de la fiesta
          </h3>
          <p className="font-body text-sm text-foreground leading-relaxed mb-3">
            El mayor lujo es poder disfrutar sin mirar el reloj. Queremos que la fiesta no tenga hora de fin y que el domingo nos despertemos todos juntos para desayunar.
          </p>
          <p className="font-body text-sm text-foreground leading-relaxed mb-3">
            Para que la convivencia sea total, distribuiremos a los invitados en los diferentes <strong>chalets y casas rurales</strong> de la finca. Se trata de alojamientos con habitaciones múltiples (con distintas combinaciones de camas dobles e individuales) y varios baños completos. ¡Tranquilos, nosotros nos encargaremos de hacer el "Tetris" y agruparos por chalets con vuestros amigos o familia para que estéis súper cómodos!
          </p>
          <p className="font-body text-sm text-foreground leading-relaxed">
            Para gestionar las pernoctas, la finca establece una <strong>tarifa plana de reserva de 50€ por persona</strong> que cubre el alojamiento de todo el fin de semana. Nosotros nos hacemos cargo de las cenas y desayunos extra, ¡así que solo tenéis que aparcar el coche y disfrutar!
          </p>

          <p className="font-body text-sm text-muted-foreground mt-4 italic">
            * Las plazas en la finca son limitadas (105 camas). Podréis asegurar la vuestra directamente al rellenar el formulario de confirmación, lo que nos ayudará a empezar a organizar las casas.
          </p>
        </div>

        {/* Transporte y Forasteros */}
        <div className="mb-6">
          <h3 className="font-heading text-xl text-[#6B2D3A] font-medium mb-2">
            🚗 Transporte y Parking
          </h3>
          <p className="font-body text-sm text-foreground leading-relaxed">
            Sabemos que hacéis un esfuerzo gigante viniendo desde lejos. La finca está a poco más de 1 hora de Madrid. Para facilitaros la llegada:
          </p>
          <ul className="font-body text-sm text-foreground mt-2 space-y-2 list-disc list-inside">
            <li><strong>Parking gratuito:</strong> Hay sitio de sobra para aparcar en la propia finca, así que podéis venir con vuestro coche y dejarlo allí sin problema.</li>
            <li><strong>Match de Coches:</strong> Vamos a intentar cuadrar a los que venís de fuera con los invitados de Madrid que tengan hueco en sus coches.</li>
            {/* <li><strong>Posible Autobús:</strong> Si vemos que muchos llegáis a horas similares a Barajas, Atocha o Chamartín, intentaremos poner un autobús para subiros a todos juntos.</li> */}
          </ul>
          <p className="font-body text-sm text-[#6B2D3A] font-medium mt-3">
            ¡Súper importante! En el formulario de confirmación os preguntamos cómo llegáis, desde dónde y vuestra hora estimada de llegada a Madrid. Rellenadlo con detalle para que podamos organizar la logística.
          </p>
        </div>

        {/* Dress code Sabado */}
        <div className="mb-2 pl-2 border-l-4 border-primary/30">
          <h3 className="font-heading text-lg text-primary font-medium mb-1">
            👔 Código de vestimenta (Sábado)
          </h3>
          <p className="font-body text-sm text-foreground">
            Para la boda: Etiqueta formal. ¡Pero traed zapatos cómodos porque la fiesta será larga!.
          </p>
        </div>
      </div>

      {/* 2. NUESTRA HISTORIA (Emoción) }
      <div className="wedding-card p-6 md:p-10">
        <h2 className="section-title mb-4">Nuestra Historia</h2>
        <p className="font-body text-sm text-foreground leading-relaxed mb-6">
          Dicen que las mejores historias son las que no te esperas. La nuestra
          comenzó un día cualquiera, entre cafés, risas y conversaciones que no
          queríamos que terminaran. Desde aquel momento supimos que lo nuestro
          era para siempre, y ahora queremos celebrarlo con la gente que más queremos. Vosotros.
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
            <span className="font-body text-xs text-muted-foreground text-center px-2">
              (Aquí podéis poner otra foto)
            </span>
          </div>
          <div className="rounded-lg overflow-hidden shadow-sm aspect-square bg-muted flex items-center justify-center">
            <span className="font-body text-xs text-muted-foreground text-center px-2">
              (Y otra más)
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
      */}

      {/* 3. FAQ (Dudas prácticas recogidas en acordeón) */}
      <div className="wedding-card p-6 md:p-10">
        <h2 className="section-title mb-4">Preguntas Frecuentes (FAQ)</h2>
        <Accordion type="single" collapsible className="w-full">
          {/*<AccordionItem value="q1">
            <AccordionTrigger className="font-body text-sm text-left hover:text-[#B89947]">
              ¿Puedo llevar acompañante que no esté en la invitación o niños?
            </AccordionTrigger>
            <AccordionContent className="font-body text-sm text-muted-foreground">
              Nos encantaría invitar a todo el mundo, pero por limitaciones de aforo nuestra boda será más íntima. Nos ceñiremos estrictamente a las personas que aparecen en la invitación. ¡Aprovecha para disfrutar de un finde libre de responsabilidades!
            </AccordionContent>
          </AccordionItem>*/}
          <AccordionItem value="q2">
            <AccordionTrigger className="font-body text-sm text-left hover:text-[#B89947]">
              ¿Qué pasa si somos más de 105 personas para dormir?
            </AccordionTrigger>
            <AccordionContent className="font-body text-sm text-muted-foreground">
              ¡No hay problema! Hemos priorizado las casas de la propia finca, pero si llenamos el aforo, gestionaremos apartamentos preciosos en el mismo pueblo para que nadie se quede sin cama. ¡Confirmad cuanto antes para asegurar vuestra plaza!
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q3">
            <AccordionTrigger className="font-body text-sm text-left hover:text-[#B89947]">
              ¿Hay opciones de menú para intolerancias o alergias?
            </AccordionTrigger>
            <AccordionContent className="font-body text-sm text-muted-foreground">
              ¡Por supuesto! Queremos que todos disfrutéis de la comida de forma segura. Por favor, indícanos cualquier alergia, intolerancia o dieta especial en el formulario de asistencia y nosotros nos encargamos del resto.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="q4">
            <AccordionTrigger className="font-body text-sm text-left hover:text-[#B89947]">
              ¿Cómo y cuándo se paga la reserva del alojamiento?
            </AccordionTrigger>
            <AccordionContent className="font-body text-sm text-muted-foreground">
              Una vez nos confirméis vuestra asistencia y si os quedáis a dormir a través del formulario de esta web, nos pondremos en contacto con vosotros más adelante para daros los detalles del Bizum/Transferencia para gestionar la reserva con la finca. ¡Súper sencillo!
            </AccordionContent>
          </AccordionItem>
          {/* NUEVA FAQ CON ENLACES A WHATSAPP */}
          <AccordionItem value="q5">
            <AccordionTrigger className="font-body text-sm text-left hover:text-[#B89947]">
              Tengo alguna otra duda, ¿cómo contacto con vosotros?
            </AccordionTrigger>
            <AccordionContent className="font-body text-sm text-muted-foreground">
              ¡Para eso estamos! Podéis escribirnos o llamarnos cuando queráis para cualquier consulta logística, de vestimenta o lo que necesitéis:
              <br /><br />
              <div className="flex flex-col gap-3">
                {/* Contacto Inés */}
                <div className="flex items-center gap-2">
                  <a
                    href="https://wa.me/34654212678"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground hover:text-[#25D366] transition-colors"
                    aria-label="Abrir WhatsApp de Inés"
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                    </svg>
                  </a>
                  <span className="font-medium text-foreground">Inés: 654 212 678</span>
                </div>

                {/* Contacto Martín */}
                <div className="flex items-center gap-2">
                  <a
                    href="https://wa.me/34637022898"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground hover:text-[#25D366] transition-colors"
                    aria-label="Abrir WhatsApp de Martín"
                  >
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                    </svg>
                  </a>
                  <span className="font-medium text-foreground">Martín: 637 02 28 98</span>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </section>
  );
}