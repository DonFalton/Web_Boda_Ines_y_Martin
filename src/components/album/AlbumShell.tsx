import { useEffect, type PropsWithChildren } from "react";
import botanicalDivider from "@/assets/botanical-divider.webp";

export function AlbumShell({ children }: PropsWithChildren) {
  useEffect(() => {
    const existing = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previous = existing?.content;
    const meta = existing ?? document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow, noarchive";
    if (!existing) document.head.append(meta);
    return () => {
      if (!existing) meta.remove();
      else existing.content = previous ?? "";
    };
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 text-center">
          <p className="mb-2 font-body text-xs font-medium uppercase tracking-[0.28em] text-primary/70">Nuestro álbum compartido</p>
          <h1 className="font-heading text-4xl font-semibold text-primary sm:text-5xl">Inés &amp; Martín</h1>
          <p className="mt-2 font-heading text-xl italic text-foreground/75">Comparte tus recuerdos</p>
          <img src={botanicalDivider} alt="" className="mx-auto mt-4 h-8 w-auto max-w-[220px] object-contain" />
        </header>
        {children}
      </div>
    </main>
  );
}
