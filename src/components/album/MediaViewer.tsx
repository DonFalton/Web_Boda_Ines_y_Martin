import { useEffect } from "react";
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

export function MediaViewer({ selected, items, onSelect, onClose }: MediaViewerProps) {
  const index = selected ? items.findIndex(item => item.id === selected.id) : -1;
  const previous = index > 0 ? items[index - 1] : null;
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null;
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

  return (
    <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[96vh] max-w-[min(96vw,1100px)] overflow-hidden border-0 p-0">
        {selected && (
          <>
            <div className="relative flex min-h-[45vh] items-center justify-center bg-black sm:min-h-[65vh]">
              {source.isLoading && <LoaderCircle className="h-8 w-8 animate-spin text-white" aria-label="Cargando recuerdo" />}
              {source.isError && <div className="px-12 text-center text-sm text-white"><p>No se ha podido abrir este recuerdo.</p><Button className="mt-3" variant="secondary" onClick={() => void source.refetch()}>Reintentar</Button></div>}
              {source.data && (selected.mimeType.startsWith("video/") ? (
                <video key={source.data.url} src={source.data.url} className="max-h-[75vh] max-w-full" controls playsInline preload="metadata">Tu navegador no puede reproducir este vídeo.</video>
              ) : (
                <img src={source.data.url} alt={selected.originalName} className="max-h-[75vh] max-w-full object-contain" />
              ))}
              <Button className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90" size="icon" variant="secondary" disabled={!previous} onClick={() => previous && onSelect(previous)} aria-label="Recuerdo anterior" aria-keyshortcuts="ArrowLeft"><ChevronLeft /></Button>
              <Button className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/90" size="icon" variant="secondary" disabled={!next} onClick={() => next && onSelect(next)} aria-label="Recuerdo siguiente" aria-keyshortcuts="ArrowRight"><ChevronRight /></Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 pr-12">
              <div className="min-w-0">
                <DialogTitle className="truncate font-heading text-xl text-primary">{selected.originalName}</DialogTitle>
                <DialogDescription>Compartido por {selected.guestName}</DialogDescription>
              </div>
              {source.data && <Button asChild variant="outline"><a href={source.data.url} target="_blank" rel="noopener noreferrer" download={source.data.filename}><Download /> Descargar</a></Button>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
