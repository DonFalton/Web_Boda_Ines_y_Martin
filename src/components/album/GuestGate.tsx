import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { AlbumApiError, albumApi } from "@/lib/album-api";

type GuestGateProps = {
  onCreated: () => Promise<unknown> | void;
  initialDisplayName?: string;
  editing?: boolean;
  onCancel?: () => void;
};

export function GuestGate({ onCreated, initialDisplayName = "", editing = false, onCancel }: GuestGateProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = displayName.normalize("NFC").replace(/\s+/gu, " ").trim();
    if (!normalized || /\p{C}/u.test(normalized) || Array.from(normalized).length > 80) {
      setError("Escribe un nombre de entre 1 y 80 caracteres.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (editing) await albumApi.updateGuest(normalized);
      else await albumApi.createGuest(normalized);
      await onCreated();
    } catch (caught) {
      setError(caught instanceof AlbumApiError ? caught.message : "No hemos podido guardar tu nombre.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="wedding-card mx-auto max-w-md p-6 sm:p-8" aria-labelledby="guest-title">
      <h2 id="guest-title" className="section-title text-center">{editing ? "Cambia tu nombre" : "¿Cómo te llamas?"}</h2>
      <p className="mt-2 text-center text-sm text-muted-foreground">{editing ? "Tus recuerdos seguirán vinculados a tu identidad." : "Así podremos mostrar quién compartió cada recuerdo."}</p>
      <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
        <div>
          <label className="form-label" htmlFor="album-display-name">Tu nombre</label>
          <input
            id="album-display-name"
            className="form-input"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={160}
            autoComplete="name"
            autoFocus
            aria-describedby={error ? "album-name-error" : undefined}
            aria-invalid={Boolean(error)}
          />
          {error && <p id="album-name-error" role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex gap-2">
          {editing && <Button className="flex-1" size="lg" variant="outline" disabled={submitting} type="button" onClick={onCancel}>Cancelar</Button>}
          <Button className="flex-1" size="lg" disabled={submitting} type="submit">
            {submitting ? "Guardando…" : editing ? "Guardar nombre" : "Entrar al álbum"}
          </Button>
        </div>
      </form>
    </section>
  );
}
