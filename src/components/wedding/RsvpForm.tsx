import botanicalDivider from "@/assets/botanical-divider.png";

export default function RsvpForm() {
  return (
    <section id="rsvp">
      <div className="wedding-card p-6 md:p-10">
        <div className="text-center mb-6">
          <img
            src={botanicalDivider}
            alt=""
            aria-hidden="true"
            className="mx-auto w-48 md:w-64 opacity-60 mb-4"
          />
          <h2 className="section-title">Confirma tu Asistencia</h2>
        </div>

        <form
          action="https://formspree.io/f/YOUR_FORM_ID_HERE"
          method="POST"
          className="space-y-5 max-w-lg mx-auto"
        >
          {/* Name */}
          <div>
            <label htmlFor="name" className="form-label">
              Nombre y Apellidos
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              placeholder="Nombre y Apellidos"
              className="form-input"
            />
          </div>

          {/* Attendance */}
          <fieldset>
            <legend className="form-label">Asistencia</legend>
            <div className="flex flex-col gap-2 mt-1">
              <label className="flex items-center gap-2 font-body text-sm cursor-pointer">
                <input
                  type="radio"
                  name="attendance"
                  value="yes"
                  required
                  className="accent-primary w-4 h-4"
                />
                Sí, asistiré
              </label>
              <label className="flex items-center gap-2 font-body text-sm cursor-pointer">
                <input
                  type="radio"
                  name="attendance"
                  value="no"
                  className="accent-primary w-4 h-4"
                />
                No podré acompañaros
              </label>
            </div>
          </fieldset>

          {/* Guests */}
          <div>
            <label htmlFor="guests" className="form-label">
              Acompañantes
            </label>
            <select id="guests" name="guests" className="form-input">
              {[0, 1, 2, 3, "4+"].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Menu */}
          <div>
            <label htmlFor="menu" className="form-label">
              Menú y Alergias
            </label>
            <select id="menu" name="menu" className="form-input">
              {["Tradicional", "Vegetariano", "Vegano", "Infantil"].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Allergies */}
          <div>
            <label htmlFor="allergies" className="form-label">
              Alergias/Intolerancias
            </label>
            <input
              type="text"
              id="allergies"
              name="allergies"
              placeholder="Indica tus alergias o intolerancias"
              className="form-input"
            />
          </div>

          {/* Bus */}
          <label className="flex items-center gap-2 font-body text-sm cursor-pointer">
            <input
              type="checkbox"
              name="bus"
              value="yes"
              className="accent-primary w-4 h-4 rounded"
            />
            Necesito plaza en el autobús
          </label>

          {/* Music */}
          <div>
            <label htmlFor="music" className="form-label">
              Peticiones musicales
            </label>
            <textarea
              id="music"
              name="music"
              rows={3}
              placeholder="¿Qué canciones no pueden faltar?"
              className="form-input resize-none"
            />
          </div>

          <div className="text-center pt-2">
            <button type="submit" className="btn-burgundy w-full md:w-auto">
              Enviar
            </button>
          </div>
        </form>

        <img
          src={botanicalDivider}
          alt=""
          aria-hidden="true"
          className="mx-auto w-48 md:w-64 opacity-60 mt-8 rotate-180"
        />
      </div>
    </section>
  );
}
