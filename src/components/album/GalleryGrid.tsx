import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Camera, LoaderCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { albumApi, type AlbumMedia } from "@/lib/album-api";
import { MediaViewer } from "./MediaViewer";

type GalleryGridProps = { onSelect?: (media: AlbumMedia) => void };

export function GalleryGrid({ onSelect }: GalleryGridProps) {
  const [selected, setSelected] = useState<AlbumMedia | null>(null);
  const gallery = useInfiniteQuery({
    queryKey: ["album-media"],
    queryFn: ({ pageParam }) => albumApi.media(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 2 * 60_000,
  });
  const items = gallery.data?.pages.flatMap(page => page.items) ?? [];

  return (
    <section className="mt-8" aria-labelledby="gallery-title">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 id="gallery-title" className="section-title">Recuerdos compartidos</h2>
          <p className="mt-1 text-sm text-muted-foreground">Fotos y vídeos de quienes celebraron con nosotros.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void gallery.refetch()} disabled={gallery.isFetching}>Actualizar</Button>
      </div>

      {gallery.isLoading && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" aria-label="Cargando galería">
          {Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}
        </div>
      )}

      {gallery.isError && (
        <div className="wedding-card p-6 text-center">
          <p className="text-sm text-muted-foreground">No hemos podido cargar la galería.</p>
          <Button className="mt-3" variant="outline" onClick={() => void gallery.refetch()}>Reintentar</Button>
        </div>
      )}

      {!gallery.isLoading && !gallery.isError && items.length === 0 && (
        <div className="wedding-card px-6 py-10 text-center">
          <Camera className="mx-auto h-8 w-8 text-primary/70" aria-hidden="true" />
          <p className="mt-3 font-heading text-xl text-primary">Sé la primera persona en compartir un recuerdo</p>
        </div>
      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {items.map(item => {
            const video = item.mimeType.startsWith("video/");
            return (
              <li key={item.id}>
                <button type="button" className="group block w-full overflow-hidden rounded-lg border bg-card text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onSelect ? onSelect(item) : setSelected(item)} aria-label={`Abrir ${item.originalName}, compartido por ${item.guestName}`}>
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    {item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /> : <Camera className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />}
                    {video && <span className="absolute inset-0 flex items-center justify-center bg-black/10"><span className="rounded-full bg-background/90 p-2 text-primary shadow"><Play className="h-5 w-5 fill-current" aria-hidden="true" /></span></span>}
                  </div>
                  <p className="truncate px-3 pb-3 pt-2 text-xs text-muted-foreground">Por <strong className="font-medium text-foreground">{item.guestName}</strong></p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {gallery.hasNextPage && <div className="mt-6 text-center"><Button variant="outline" disabled={gallery.isFetchingNextPage} onClick={() => void gallery.fetchNextPage()}>{gallery.isFetchingNextPage ? <><LoaderCircle className="animate-spin" /> Cargando…</> : "Ver más recuerdos"}</Button></div>}
      {!onSelect && <MediaViewer selected={selected} items={items} onSelect={setSelected} onClose={() => setSelected(null)} />}
    </section>
  );
}
