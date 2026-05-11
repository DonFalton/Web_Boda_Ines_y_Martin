import { useState } from "react";
import botanicalDivider from "@/assets/botanical-divider.webp";
import exitoImg from "@/assets/Biien.webp";
const funnyNames = [
  "Pedro Pascal",
  "Keanu Reeves",
  "Benito Antonio Martínez Ocasio",
  "Francisco de Quevedo",
  "Juan Carrillo",
  "Rosalía Vila",
];

const partySongs = [
  "Danza Kuduro - Don Omar",
  "Paquito el Chocolatero",
  "Aserejé - Las Ketchup",
  "La Macarena - Los del Río",
  "Flying Free - Pont Aeri",
  "Mi Gran Noche - Raphael",
  "La Bomba - King África",
  "Yo quiero bailar - Sonia y Selena",
  "Ave María - David Bisbal",
  "Gasolina - Daddy Yankee",
  "Why Don't You Get a Job? - The Offspring",
  "Don't Eat the Yellow Snow - Frank Zappa",
  "Everybody's Got Something to Hide Except Me and My Monkey - The Beatles"
];

export default function RsvpForm() {
  const [isAttending, setIsAttending] = useState("yes");
  const [numCompanions, setNumCompanions] = useState(0);

  // Nuevo estado para controlar si se ha enviado el formulario o si está cargando
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // NUEVO ESTADO: Coge 3 nombres al azar distintos al cargar la página
  const [randomNames] = useState(() => {
    const shuffled = [...funnyNames].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  });

  // NUEVO ESTADO: Elige un temazo al azar al cargar la página
  const [randomSong] = useState(() => {
    return partySongs[Math.floor(Math.random() * partySongs.length)];
  });

  // Esta es la función mágica que envía los datos a tu Google Sheet
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);

    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      // AQUÍ PEGAGAS EL ENLACE DE TU GOOGLE SCRIPT (Entre las comillas)
      await fetch("https://script.google.com/macros/s/AKfycbwG-iRCx8JOwgyhMyxBbVf6RRlzFbbBEPJAyHr7R1YSUq3lo43A3eeNOci9Cr5RiJ6Q/exec", {
        method: "POST",
        body: data,
        mode: "no-cors" // ¡ESTO ES VITAL PARA QUE GOOGLE NO BLOQUEE EL ENVÍO!
      });

      // Si llega hasta aquí, mostramos la pantalla de éxito
      setIsSubmitted(true);
    } catch (error) {
      alert("Error de conexión. Por favor, inténtalo más tarde.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Si el formulario ya se envió, mostramos esta pantalla de agradecimiento
  if (isSubmitted) {
    return (
      <section id="rsvp">
        <div className="wedding-card p-6 md:p-10 text-center animate-in zoom-in duration-500">
          <img
            src={botanicalDivider}
            alt=""
            aria-hidden="true"
            className="mx-auto w-72 md:w-96 opacity-60 mb-6"
          />

          {/* Título dinámico */}
          <h2 className="font-heading text-4xl text-[#6B2D3A] italic mb-4">
            {isAttending === "yes"
              ? "¡Gracias de corazón!"
              : "¡Os echaremos de menos!"}
          </h2>

          {/* Mensaje dinámico */}
          <p className="font-body text-lg text-foreground mb-8">
            {isAttending === "yes"
              ? "Hemos recibido tu confirmación y tus opciones correctamente. ¡Qué ganas de celebrar juntos!"
              : "Hemos recibido tu respuesta. Nos da muchísima pena que no podáis acompañarnos, ¡pero brindaremos a vuestra salud!"}
          </p>

          {/* LA FOTO DIVERTIDA DE ÉXITO (Solo se muestra si asisten) */}
          <div className={`mb-8 mx-auto max-w-[280px] md:max-w-sm rounded-xl overflow-hidden shadow-xl border-4 border-white rotate-[2deg] hover:rotate-0 transition-transform duration-300 ${isAttending === "yes" ? "block" : "hidden"}`}>
            <img
              src={exitoImg}
              alt="¡Confirmación recibida!"
              className="w-full h-auto object-cover"
            />
          </div>

          <img
            src={botanicalDivider}
            alt=""
            aria-hidden="true"
            className="mx-auto w-72 md:w-96 opacity-60 mt-4 rotate-180"
          />
        </div>
      </section>
    );
  }

  // Si no se ha enviado, mostramos el formulario normal
  return (
    <section id="rsvp">
      <div className="wedding-card p-6 md:p-10">
        <div className="text-center mb-6">
          <img
            src={botanicalDivider}
            alt=""
            aria-hidden="true"
            className="mx-auto w-72 md:w-96 opacity-60 mb-4"
          />
          <h2 className="section-title">Confirma tu Asistencia</h2>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 max-w-lg mx-auto"
        >
          {/* Nombre */}
          <div>
            <label htmlFor="name" className="form-label">
              Nombre y Apellidos (El tuyo)
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              placeholder={`Ej. ${randomNames[0]}`}
              className="form-input"
              maxLength={100}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Asistencia */}
          <fieldset>
            <legend className="form-label">Asistencia</legend>
            <div className="flex flex-col gap-2 mt-1">
              <label className="flex items-center gap-2 font-body text-sm cursor-pointer hover:text-[#6B2D3A] transition-colors">
                <input
                  type="radio"
                  name="attendance"
                  value="yes"
                  checked={isAttending === "yes"}
                  onChange={(e) => setIsAttending(e.target.value)}
                  required
                  className="accent-[#6B2D3A] w-4 h-4"
                />
                Sí, ¡no me lo pierdo por nada!
              </label>
              <label className="flex items-center gap-2 font-body text-sm cursor-pointer hover:text-[#6B2D3A] transition-colors">
                <input
                  type="radio"
                  name="attendance"
                  value="no"
                  checked={isAttending === "no"}
                  onChange={(e) => setIsAttending(e.target.value)}
                  className="accent-[#6B2D3A] w-4 h-4"
                />
                No, pero brindaré desde la distancia 🥂
              </label>
            </div>
          </fieldset>

          {/* Mostrar resto del formulario SÓLO si asisten */}
          <div className={`space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 ${isAttending === "yes" ? "block" : "hidden"}`}>

            {/* Acompañantes ACTUALIZADO A MÁXIMO 2 */}
            <div>
              <label htmlFor="guests" className="form-label">
                Acompañantes (además de ti)
              </label>
              <select
                id="guests"
                name="guests"
                className="form-input"
                value={numCompanions}
                onChange={(e) => setNumCompanions(Number(e.target.value))}
              >
                {[0, 1, 2].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Las siguientes opciones se aplicarán a ti y a tus acompañantes.
              </p>
            </div>

            {/* SECCIÓN NUEVA: El Plan del Fin de Semana */}
            <div className="space-y-4 pt-4 border-t border-border/50">
              <p className="font-heading text-xl text-center text-[#6B2D3A] italic">
                El Plan del Fin de Semana
              </p>

              {/* BBQ */}
              <fieldset>
                <legend className="form-label text-sm">¿Te vienes a la Barbacoa del Viernes?</legend>
                <div className="flex flex-col gap-2 mt-1">
                  <label className="flex items-center gap-2 font-body text-sm cursor-pointer">
                    <input type="radio" name="viernes_bbq" value="yes" required className="accent-[#6B2D3A] w-4 h-4" />
                    ¡Sí! Allí estaré (Outfit hortera preparado)
                  </label>
                  <label className="flex items-center gap-2 font-body text-sm cursor-pointer">
                    <input type="radio" name="viernes_bbq" value="no" className="accent-[#6B2D3A] w-4 h-4" />
                    No, llegaré el sábado directamente
                  </label>
                </div>
              </fieldset>

              {/* Alojamiento */}
              <fieldset>
                <legend className="form-label text-sm">Alojamiento en la Finca (50€/pax todo el finde)</legend>
                <div className="flex flex-col gap-2 mt-1">
                  <label className="flex items-center gap-2 font-body text-sm cursor-pointer">
                    <input type="radio" name="alojamiento" value="yes" required className="accent-[#6B2D3A] w-4 h-4" />
                    ¡Sí! Reservadme cama, quiero dormir allí
                  </label>
                  <label className="flex items-center gap-2 font-body text-sm cursor-pointer">
                    <input type="radio" name="alojamiento" value="no" className="accent-[#6B2D3A] w-4 h-4" />
                    No hace falta, ya tengo donde dormir / vuelvo a casa
                  </label>
                </div>
              </fieldset>
            </div>

            {/* SECCIÓN NUEVA: Logística y Transporte */}
            <div className="space-y-4 pt-4 border-t border-border/50 bg-muted/20 p-4 rounded-lg">
              <p className="font-heading text-xl text-center text-[#6B2D3A] italic mb-2">
                Viaje y Transporte
              </p>

              <div>
                <label htmlFor="origen" className="form-label text-xs">¿Desde dónde vienes?</label>
                <input type="text" id="origen" name="origen" placeholder="Ej. Madrid Centro, Barcelona, Londres..." required className="form-input text-sm" maxLength={100} autoComplete="off" spellCheck={false} />
              </div>

              <div>
                <label htmlFor="transporte" className="form-label text-xs">¿Cómo tienes pensado llegar?</label>
                <select id="transporte" name="transporte" required className="form-input text-sm">
                  <option value="" disabled selected>Elige una opción...</option>
                  <option value="coche_con_hueco">Llevo mi coche y tengo plazas libres (Match)</option>
                  <option value="coche_lleno">Llevo mi coche (sin plazas libres)</option>
                  <option value="necesito_coche">Me gustaría acoplarme en el coche de alguien</option>
                  <option value="transporte_publico">Llego en Avión/Tren a Madrid</option>
                </select>
              </div>

              <div>
                <label htmlFor="llegada" className="form-label text-xs">Hora estimada de llegada a Madrid / a la Finca</label>
                <input type="text" id="llegada" name="llegada" placeholder="Ej. Viernes a las 19:00h en Atocha" className="form-input text-sm" maxLength={100} autoComplete="off" spellCheck={false} />
              </div>
            </div>

            {/* Sección Dinámica de Menús */}
            <div className="space-y-4 pt-4 border-t border-border/50">
              <p className="font-heading text-xl text-center text-[#6B2D3A] italic">
                Elección de Menús
              </p>

              {/* Menú: Invitado Principal */}
              <div className="bg-muted/40 p-4 rounded-lg border border-border/50 space-y-3 shadow-sm">
                <p className="font-body font-semibold text-sm text-[#B89947] uppercase tracking-wider">Tu Menú</p>
                <div>
                  <label htmlFor="menu_principal" className="form-label text-xs">Tipo de Menú</label>
                  <select id="menu_principal" name="menu_principal" className="form-input text-sm">
                    {["Tradicional", "Vegetariano", "Vegano", "Infantil"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="alergias_principal" className="form-label text-xs">Alergias / Intolerancias</label>
                  <input
                    type="text"
                    id="alergias_principal"
                    name="alergias_principal"
                    placeholder="Ej. Celíaco, alergia al marisco..."
                    className="form-input text-sm"
                    maxLength={100}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>

              {/* Menús: Acompañantes */}
              {Array.from({ length: numCompanions }).map((_, index) => (
                <div key={index} className="bg-muted/40 p-4 rounded-lg border border-border/50 space-y-3 shadow-sm animate-in fade-in duration-300">
                  <p className="font-body font-semibold text-sm text-[#B89947] uppercase tracking-wider">
                    Acompañante {index + 1}
                  </p>

                  {/* NUEVO: Campo para el nombre del acompañante */}
                  <div>
                    <label htmlFor={`nombre_acompanante_${index + 1}`} className="form-label text-xs">Nombre y Apellidos</label>
                    <input
                      type="text"
                      id={`nombre_acompanante_${index + 1}`}
                      name={`nombre_acompanante_${index + 1}`}
                      placeholder={`Ej. ${randomNames[index + 1]}`}
                      required
                      className="form-input text-sm"
                      maxLength={100}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>

                  <div>
                    <label htmlFor={`menu_acompanante_${index + 1}`} className="form-label text-xs">Tipo de Menú</label>
                    <select id={`menu_acompanante_${index + 1}`} name={`menu_acompanante_${index + 1}`} className="form-input text-sm">
                      {["Tradicional", "Vegetariano", "Vegano", "Infantil"].map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`alergias_acompanante_${index + 1}`} className="form-label text-xs">Alergias / Intolerancias</label>
                    <input
                      type="text"
                      id={`alergias_acompanante_${index + 1}`}
                      name={`alergias_acompanante_${index + 1}`}
                      placeholder="Ej. Sin lactosa..."
                      className="form-input text-sm"
                      maxLength={100}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Música y Spotify */}
            <div className="pt-6 border-t border-border/50 space-y-4">
              <div className="text-center">
                <h3 className="font-heading text-xl text-[#6B2D3A] italic mb-1">Peticiones Musicales</h3>
                <p className="font-body text-sm text-muted-foreground mb-4">
                  ¿Qué canción te haría darlo todo en la pista? <br />
                  <span className="font-semibold text-foreground">¡O mejor, añádela tú mismo a nuestra lista!</span>
                </p>
              </div>

              {/* Botón hacia Spotify */}
              <div className="flex justify-center mb-4">
                <a
                  href="https://open.spotify.com/playlist/3YfpeHu8FUuEAnS5dd25by?si=49a1a00894134ba4&pt=dab04000c852ef126c4a74eaa4d930a7"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 bg-[#1DB954] hover:bg-[#1ed760] text-white px-6 py-3 rounded-full font-body text-sm font-bold transition-colors shadow-md"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.241 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.84.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                  Abrir en Spotify
                </a>
              </div>

              {/* Iframe de Spotify (Visual) */}
              <div className="rounded-xl overflow-hidden shadow-sm border border-border/50 bg-muted/20">
                <iframe
                  title="Spotify Playlist"
                  src="https://open.spotify.com//embed/playlist/3YfpeHu8FUuEAnS5dd25by?si=ab52559997804164&pt=a409e2bfb418237d423e1506c9d2bb81"
                  width="100%"
                  height="152"
                  style={{ border: "none" }}
                  allowFullScreen
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                ></iframe>
              </div>

              {/* Campo de texto tradicional */}
              <div className="pt-2">
                <label htmlFor="music" className="form-label text-xs text-muted-foreground">
                  Si no usas Spotify, puedes escribirla aquí:
                </label>
                <textarea
                  id="music"
                  name="music"
                  rows={1}
                  // APLICAMOS LA CANCIÓN ALEATORIA AQUÍ:
                  placeholder={`Ej. ${randomSong}`}
                  className="form-input resize-none text-sm bg-background/50"
                  maxLength={400}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
          </div>

          {/* Mensaje si no asisten */}
          <div className={`text-center py-6 animate-in fade-in duration-500 ${isAttending === "no" ? "block" : "hidden"}`}>
            <p className="font-heading text-lg text-muted-foreground italic">
              ¡Cuánto lo sentimos! Os echaremos muchísimo de menos en nuestro gran día.
            </p>
          </div>

          {/* Botón de Enviar */}
          <div className="text-center pt-6">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#6B2D3A] hover:bg-[#52222c] disabled:opacity-70 text-white px-10 py-3 rounded-md uppercase tracking-widest text-sm transition-colors shadow-md w-full md:w-auto"
            >
              {isSubmitting ? "Enviando..." : "Enviar Confirmación"}
            </button>
          </div>
        </form>

      </div>
    </section>
  );
}