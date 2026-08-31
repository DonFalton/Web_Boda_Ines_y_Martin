import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { albumApi, type AlbumMedia } from "@/lib/album-api";

type MediaViewerProps = {
  selected: AlbumMedia | null;
  items: AlbumMedia[];
  onSelect: (media: AlbumMedia) => void;
  onClose: () => void;
};

const SWIPE_THRESHOLD = 50;

export function MediaViewer({ selected, items, onSelect, onClose }: MediaViewerProps) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const index = selected ? items.findIndex(item => item.id === selected.id) : -1;
  const previous = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
  const isVideo = selected?.mimeType.startsWith("video/") ?? false;
  const source = useQuery({
    queryKey: ["album-media-source", selected?.id],
    queryFn: () => albumApi.mediaSource(selected!.id),
    enabled: Boolean(selected),
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (!selected) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && previous) { event.preventDefault(); onSelect(previous); }
      if (event.key === "ArrowRight" && next) { event.preventDefault(); onSelect(next); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [next, onSelect, previous, selected]);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selected]);

  function pointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (isVideo || event.isPrimary === false) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
  }

  function pointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start || isVideo) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    if (deltaX > 0 && previous) onSelect(previous);
    if (deltaX < 0 && next) onSelect(next);
  }

  return (
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="album-viewer-content h-[100dvh] max-h-none w-screen max-w-none gap-0 overflow-hidden rounded-none border-0 bg-[#160d10] p-0 text-white shadow-none sm:rounded-none">
        {selected && (
          <>
            <DialogTitle className="sr-only">Recuerdo compartido por {selected.guestName}</DialogTitle>
            <DialogDescription className="sr-only">Recuerdo {index + 1} de {items.length}</DialogDescription>

            <div
              className="relative flex h-full w-full touch-pan-y items-center justify-center overflow-hidden"
              onPointerDown={pointerDown}
              onPointerUp={pointerUp}
              onPointerCancel={() => { pointerStart.current = null; }}
            >
              <div className="absolute inset-x-0 top-0 z-20 flex min-h-20 items-start bg-gradient-to-b from-black/70 via-black/25 to-transparent px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))] pr-16 sm:px-6">
                <div>
                  <p className="text-sm font-medium text-white">Por {selected.guestName}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-white/70">{index + 1} de {items.length}</p>
                </div>
              </div>

              {source.isLoading && <LoaderCircle className="h-8 w-8 animate-spin text-white" aria-label="Cargando recuerdo" />}
              {source.isError && <div className="relative z-20 max-w-xs px-6 text-center text-sm text-white"><p>No se ha podido abrir este recuerdo.</p><Button className="mt-3" variant="secondary" onClick={() => void source.refetch()}>Reintentar</Button></div>}
              {source.data && (isVideo ? (
                <video key={source.data.url} src={source.data.url} className="max-h-[calc(100dvh-7rem)] max-w-full" autoPlay muted controls playsInline preload="metadata">Tu navegador no puede reproducir este vídeo.</video>
              ) : (
                <img src={source.data.url} alt={`Recuerdo compartido por ${selected.guestName}`} className="max-h-[100dvh] max-w-full select-none object-contain" draggable={false} />
              ))}

              {!isVideo && previous && <button type="button" className="absolute inset-y-20 left-0 z-10 w-[24%] focus-visible:bg-white/10 focus-visible:outline-none sm:hidden" onClick={() => onSelect(previous)} aria-label="Recuerdo anterior" aria-keyshortcuts="ArrowLeft" />}
              {!isVideo && next && <button type="button" className="absolute inset-y-20 right-0 z-10 w-[24%] focus-visible:bg-white/10 focus-visible:outline-none sm:hidden" onClick={() => onSelect(next)} aria-label="Recuerdo siguiente" aria-keyshortcuts="ArrowRight" />}

              <Button className="absolute left-4 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border-0 bg-black/45 text-white shadow-lg backdrop-blur hover:bg-black/65 sm:inline-flex" size="icon" variant="ghost" disabled={!previous} onClick={() => previous && onSelect(previous)} aria-label="Recuerdo anterior" aria-keyshortcuts="ArrowLeft"><ChevronLeft /></Button>
              <Button className="absolute right-4 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border-0 bg-black/45 text-white shadow-lg backdrop-blur hover:bg-black/65 sm:inline-flex" size="icon" variant="ghost" disabled={!next} onClick={() => next && onSelect(next)} aria-label="Recuerdo siguiente" aria-keyshortcuts="ArrowRight"><ChevronRight /></Button>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex min-h-24 items-end justify-center bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-8">
                {source.data && <Button className="pointer-events-auto h-10 rounded-full border-white/25 bg-black/40 px-4 text-white backdrop-blur hover:bg-black/60 hover:text-white" asChild variant="outline"><a href={source.data.url} target="_blank" rel="noopener noreferrer" download={source.data.filename}><Download /> Descargar</a></Button>}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
