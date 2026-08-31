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
    <main className="min-h-screen bg-background px-3 py-4 text-foreground sm:px-6 sm:py-7">
      <div className="mx-auto w-full max-w-7xl">
        <header className="mb-4 text-center sm:mb-6">
          <p className="mb-1 font-body text-[10px] font-medium uppercase tracking-[0.26em] text-primary/65 sm:text-xs">Nuestro álbum compartido</p>
          <h1 className="font-heading text-[2.35rem] font-semibold leading-none text-primary sm:text-5xl">Inés &amp; Martín</h1>
          <p className="mt-1 font-heading text-lg italic text-foreground/70 sm:text-xl">Comparte tus recuerdos</p>
          <img src={botanicalDivider} alt="" className="mx-auto mt-2 h-6 w-auto max-w-[180px] object-contain sm:mt-3 sm:h-7 sm:max-w-[210px]" />
        </header>
        {children}
      </div>
    </main>
  );
}
