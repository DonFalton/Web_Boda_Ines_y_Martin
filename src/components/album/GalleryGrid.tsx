import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowDownUp, CalendarDays, Camera, Check, Download, Grid2X2, LayoutGrid, LoaderCircle, Play, RefreshCw, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { albumApi, type AlbumMedia, type AlbumMediaOrder } from "@/lib/album-api";
import { cn } from "@/lib/utils";
import { MediaViewer } from "./MediaViewer";

type GalleryGridProps = {
  onSelect?: (media: AlbumMedia) => void;
  onSelectionModeChange?: (active: boolean) => void;
};

type PreparedDownload = {
  id: string;
  filename: string;
  url: string;
};

const MAX_SELECTION = 20;
const LONG_PRESS_MS = 420;
const LONG_PRESS_MOVE_TOLERANCE = 12;
const GALLERY_PREFERENCES_KEY = "album-gallery-preferences-v1";

type GalleryLayout = "comfortable" | "grid" | "day";
type GalleryPreferences = { layout: GalleryLayout; order: AlbumMediaOrder };
type SelectionGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  startId: string;
  timer: number;
  active: boolean;
  visited: Set<string>;
};

const defaultPreferences: GalleryPreferences = { layout: "comfortable", order: "newest" };

function loadGalleryPreferences(): GalleryPreferences {
  try {
    const value = JSON.parse(window.localStorage.getItem(GALLERY_PREFERENCES_KEY) ?? "null") as Partial<GalleryPreferences> | null;
    return {
      layout: value?.layout === "grid" || value?.layout === "day" || value?.layout === "comfortable" ? value.layout : defaultPreferences.layout,
      order: value?.order === "oldest" || value?.order === "newest" ? value.order : defaultPreferences.order,
    };
  }
  catch {
    return defaultPreferences;
  }
}

function localDayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayLabel(value: string) {
  const label = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
  return label.charAt(0).toLocaleUpperCase("es-ES") + label.slice(1);
}

function startBrowserDownload(download: PreparedDownload) {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "";
  frame.dataset.albumDownload = download.id;
  frame.setAttribute("sandbox", "allow-downloads");
  frame.src = download.url;
  document.body.append(frame);
  window.setTimeout(() => frame.remove(), 60_000);
}

export function GalleryGrid({ onSelect, onSelectionModeChange }: GalleryGridProps) {
  const viewerReturnFocus = useRef<HTMLButtonElement | null>(null);
  const selectionGesture = useRef<SelectionGesture | null>(null);
  const suppressedClickId = useRef<string | null>(null);
  const suppressedClickTimer = useRef<number | null>(null);
  const selectionLimitNotified = useRef(false);
  const [viewerItem, setViewerItem] = useState<AlbumMedia | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preparingDownloads, setPreparingDownloads] = useState(false);
  const [preparedDownloads, setPreparedDownloads] = useState<PreparedDownload[]>([]);
  const [preferences, setPreferences] = useState(loadGalleryPreferences);
  const { layout, order } = preferences;
  const gallery = useInfiniteQuery({
    queryKey: ["album-media", order],
    queryFn: ({ pageParam }) => albumApi.media(pageParam, order),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 2 * 60_000,
  });
  const items = useMemo(() => gallery.data?.pages.flatMap(page => page.items) ?? [], [gallery.data?.pages]);
  const itemsById = useMemo(() => new Map(items.map(item => [item.id, item])), [items]);
  const dayGroups = useMemo(() => {
    const groups = new Map<string, AlbumMedia[]>();
    for (const item of items) {
      const key = localDayKey(item.createdAt);
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }
    return [...groups.entries()].map(([key, groupItems]) => ({ key, label: dayLabel(groupItems[0].createdAt), items: groupItems }));
  }, [items]);
  const selectedItems = items.filter(item => selectedIds.has(item.id));

  useEffect(() => onSelectionModeChange?.(selectionMode), [onSelectionModeChange, selectionMode]);
  useEffect(() => {
    try { window.localStorage.setItem(GALLERY_PREFERENCES_KEY, JSON.stringify(preferences)); }
    catch { /* The gallery remains usable when storage is unavailable. */ }
  }, [preferences]);
  useEffect(() => () => {
    if (selectionGesture.current) window.clearTimeout(selectionGesture.current.timer);
    if (suppressedClickTimer.current) window.clearTimeout(suppressedClickTimer.current);
  }, []);

  function leaveSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setPreparedDownloads([]);
  }

  function toggleItem(item: AlbumMedia) {
    setPreparedDownloads([]);
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else if (next.size < MAX_SELECTION) next.add(item.id);
      else toast.info(`Puedes seleccionar hasta ${MAX_SELECTION} recuerdos.`);
      return next;
    });
  }

  function selectItem(item: AlbumMedia) {
    setPreparedDownloads([]);
    setSelectedIds(current => {
      if (current.has(item.id)) return current;
      if (current.size >= MAX_SELECTION) {
        if (!selectionLimitNotified.current) {
          selectionLimitNotified.current = true;
          toast.info(`Puedes seleccionar hasta ${MAX_SELECTION} recuerdos.`);
        }
        return current;
      }
      const next = new Set(current);
      next.add(item.id);
      return next;
    });
  }

  function suppressNextClick(itemId: string) {
    suppressedClickId.current = itemId;
    if (suppressedClickTimer.current) window.clearTimeout(suppressedClickTimer.current);
    suppressedClickTimer.current = window.setTimeout(() => {
      if (suppressedClickId.current === itemId) suppressedClickId.current = null;
    }, 800);
  }

  function beginTouchSelection(event: ReactPointerEvent<HTMLButtonElement>, item: AlbumMedia) {
    if (event.isPrimary === false || (event.pointerType && event.pointerType !== "touch" && event.pointerType !== "pen")) return;
    if (selectionGesture.current) return;
    const target = event.currentTarget;
    const gesture: SelectionGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startId: item.id,
      timer: 0,
      active: false,
      visited: new Set(),
    };
    gesture.timer = window.setTimeout(() => {
      if (selectionGesture.current !== gesture) return;
      gesture.active = true;
      gesture.visited.add(item.id);
      selectionLimitNotified.current = false;
      suppressNextClick(item.id);
      setSelectionMode(true);
      selectItem(item);
      try { target.setPointerCapture?.(gesture.pointerId); }
      catch { /* Pointer capture can disappear if the browser cancels the gesture. */ }
    }, LONG_PRESS_MS);
    selectionGesture.current = gesture;
  }

  function continueTouchSelection(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = selectionGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!gesture.active) {
      const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
      if (distance > LONG_PRESS_MOVE_TOLERANCE) {
        window.clearTimeout(gesture.timer);
        selectionGesture.current = null;
      }
      return;
    }
    event.preventDefault();
    const edge = 56;
    if (event.clientY < edge) window.scrollBy({ top: -18, behavior: "auto" });
    else if (event.clientY > window.innerHeight - edge) window.scrollBy({ top: 18, behavior: "auto" });
    const hit = document.elementFromPoint?.(event.clientX, event.clientY)?.closest<HTMLElement>("[data-media-id]");
    const itemId = hit?.dataset.mediaId;
    if (!itemId || gesture.visited.has(itemId)) return;
    const item = itemsById.get(itemId);
    if (!item) return;
    gesture.visited.add(itemId);
    selectItem(item);
  }

  function finishTouchSelection(event: ReactPointerEvent<HTMLButtonElement>) {
    const gesture = selectionGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    window.clearTimeout(gesture.timer);
    if (gesture.active) {
      event.preventDefault();
      suppressNextClick(gesture.startId);
      try {
        if (event.currentTarget.hasPointerCapture?.(gesture.pointerId)) event.currentTarget.releasePointerCapture(gesture.pointerId);
      }
      catch { /* The pointer may already have been released by the browser. */ }
    }
    selectionGesture.current = null;
  }

  function activateItem(item: AlbumMedia, trigger: HTMLButtonElement) {
    if (suppressedClickId.current === item.id) {
      suppressedClickId.current = null;
      return;
    }
    if (selectionMode) toggleItem(item);
    else if (onSelect) onSelect(item);
    else openViewer(item, trigger);
  }

  function selectAll() {
    const selectable = items.slice(0, MAX_SELECTION);
    setSelectedIds(new Set(selectable.map(item => item.id)));
    setPreparedDownloads([]);
    if (items.length > MAX_SELECTION) toast.info(`Se han seleccionado los primeros ${MAX_SELECTION} recuerdos.`);
  }

  function openViewer(item: AlbumMedia, trigger: HTMLButtonElement) {
    viewerReturnFocus.current = trigger;
    setViewerItem(item);
  }

  function closeViewer() {
    setViewerItem(null);
    window.requestAnimationFrame(() => viewerReturnFocus.current?.focus());
  }

  async function downloadSelection() {
    if (!selectedItems.length || preparingDownloads) return;
    setPreparingDownloads(true);
    setPreparedDownloads([]);
    const results = await Promise.allSettled(selectedItems.map(async item => {
      const source = await albumApi.mediaSource(item.id);
      return { id: item.id, filename: source.filename, url: source.url } satisfies PreparedDownload;
    }));
    const ready = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    setPreparedDownloads(ready);
    ready.forEach(startBrowserDownload);
    setPreparingDownloads(false);

    if (ready.length) {
      toast.info(`${ready.length === 1 ? "Descarga preparada" : `${ready.length} descargas preparadas`}.`, {
        description: "El navegador puede pedir permiso para varias descargas. Si bloquea alguna, usa los enlaces individuales.",
      });
    }
    if (ready.length !== selectedItems.length) toast.error("No se pudieron preparar todas las descargas.");
  }

  const gridClassName = layout === "comfortable"
    ? "grid grid-cols-2 gap-1.5 sm:gap-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
    : "grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-1.5 md:grid-cols-5 lg:grid-cols-6 2xl:grid-cols-8";

  function renderMediaItem(item: AlbumMedia) {
    const isVideo = item.mimeType.startsWith("video/");
    const isSelected = selectedIds.has(item.id);
    const actionLabel = selectionMode
      ? `${isSelected ? "Deseleccionar" : "Seleccionar"} recuerdo compartido por ${item.guestName}`
      : `Abrir recuerdo compartido por ${item.guestName}`;
    return (
      <li key={item.id}>
        <button
          type="button"
          data-media-id={item.id}
          className={cn(
            "group relative block w-full touch-pan-y select-none overflow-hidden rounded-md bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:rounded-lg",
            layout === "comfortable" ? "aspect-[4/5]" : "aspect-square",
            isSelected && "ring-2 ring-primary ring-offset-2",
          )}
          onClick={(event) => activateItem(item, event.currentTarget)}
          onPointerDown={(event) => beginTouchSelection(event, item)}
          onPointerMove={continueTouchSelection}
          onPointerUp={finishTouchSelection}
          onPointerCancel={finishTouchSelection}
          onContextMenu={(event) => { if (selectionGesture.current?.active || suppressedClickId.current === item.id) event.preventDefault(); }}
          aria-label={actionLabel}
          aria-pressed={selectionMode ? isSelected : undefined}
        >
          {item.thumbnailUrl ? (
            <img src={item.thumbnailUrl} alt="" loading="lazy" className="pointer-events-none h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]" draggable={false} />
          ) : (
            <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-muted to-secondary text-muted-foreground">
              {isVideo ? <Video className="h-8 w-8" aria-hidden="true" /> : <Camera className="h-8 w-8" aria-hidden="true" />}
              <span className="text-[10px] font-medium uppercase tracking-wider">{isVideo ? "Vídeo" : "Foto"}</span>
            </span>
          )}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/25 to-transparent opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
          {isVideo && <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10"><span className="rounded-full bg-black/55 p-2.5 text-white shadow-lg backdrop-blur-sm"><Play className="h-5 w-5 fill-current" aria-hidden="true" /></span></span>}
          {selectionMode && (
            <span className={cn("pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-black/35 text-white shadow", isSelected && "border-primary bg-primary")} aria-hidden="true">
              {isSelected && <Check className="h-4 w-4" />}
            </span>
          )}
        </button>
      </li>
    );
  }

  return (
    <section className={cn("album-gallery mt-1 pb-20 sm:mt-7 sm:pb-0", selectionMode && "pb-36")} aria-labelledby="gallery-title">
      <div className="mb-3 flex items-center justify-between gap-3 sm:mb-4">
        <div className="min-w-0">
          <h2 id="gallery-title" className="font-heading text-2xl font-semibold leading-[0.95] text-primary sm:text-3xl sm:leading-tight">Recuerdos compartidos</h2>
          <p className="text-xs text-muted-foreground sm:text-sm">{items.length ? `${items.length} ${items.length === 1 ? "recuerdo" : "recuerdos"}` : "Fotos y vídeos de la celebración"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button className="h-10 w-10" size="icon" variant="ghost" onClick={() => void gallery.refetch()} disabled={gallery.isFetching} aria-label="Actualizar galería" title="Actualizar galería">
            <RefreshCw className={cn(gallery.isFetching && "animate-spin")} />
          </Button>
          {items.length > 0 && !selectionMode && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-10 w-10" size="icon" variant="ghost" aria-label="Diseño y orden" title="Diseño y orden"><LayoutGrid /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64" align="end">
                <DropdownMenuLabel>Diseño</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={layout} onValueChange={(value) => {
                  if (value === "comfortable" || value === "grid" || value === "day") setPreferences(current => ({ ...current, layout: value }));
                }}>
                  <DropdownMenuRadioItem value="comfortable"><LayoutGrid className="mr-2 h-4 w-4" /> Cómodo</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="grid"><Grid2X2 className="mr-2 h-4 w-4" /> Cuadrícula</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="day"><CalendarDays className="mr-2 h-4 w-4" /> Día</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-2"><ArrowDownUp className="h-4 w-4" /> Orden</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={order} onValueChange={(value) => {
                  if (value === "newest" || value === "oldest") setPreferences(current => ({ ...current, order: value }));
                }}>
                  <DropdownMenuRadioItem value="newest">Añadidos recientemente</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="oldest">Añadidos primero</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {items.length > 0 && !selectionMode && <Button className="h-10 px-3 text-xs sm:text-sm" size="sm" variant="outline" onClick={() => setSelectionMode(true)}><Check /> Seleccionar</Button>}
          {selectionMode && <Button className="h-10 px-3 text-xs sm:text-sm" size="sm" variant="ghost" onClick={leaveSelectionMode}><X /> Cerrar</Button>}
        </div>
      </div>

      {gallery.isLoading && (
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5" aria-label="Cargando galería">
          {Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="aspect-[4/5] rounded-md sm:rounded-lg" />)}
        </div>
      )}

      {gallery.isError && (
        <div className="wedding-card p-6 text-center">
          <p className="text-sm text-muted-foreground">No hemos podido cargar la galería.</p>
          <Button className="mt-3" variant="outline" onClick={() => void gallery.refetch()}>Reintentar</Button>
        </div>
      )}

      {!gallery.isLoading && !gallery.isError && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-primary/20 bg-card/55 px-5 py-10 text-center sm:py-14">
          <Camera className="mx-auto h-8 w-8 text-primary/65" aria-hidden="true" />
          <p className="mt-3 font-heading text-xl text-primary sm:text-2xl">Sé la primera persona en compartir un recuerdo</p>
          <p className="mt-1 text-xs text-muted-foreground">Usa el botón de subir para estrenar el álbum.</p>
        </div>
      )}

      {items.length > 0 && layout !== "day" && <ul className={gridClassName}>{items.map(renderMediaItem)}</ul>}

      {items.length > 0 && layout === "day" && (
        <div className="space-y-6" data-gallery-layout="day">
          {dayGroups.map(group => (
            <section key={group.key} aria-labelledby={`album-day-${group.key}`}>
              <h3 id={`album-day-${group.key}`} className="mb-2 font-heading text-lg font-semibold text-primary sm:text-xl">{group.label}</h3>
              <ul className={gridClassName}>{group.items.map(renderMediaItem)}</ul>
            </section>
          ))}
        </div>
      )}

      {gallery.hasNextPage && <div className="mt-5 text-center"><Button className="h-9 text-xs" variant="ghost" disabled={gallery.isFetchingNextPage} onClick={() => void gallery.fetchNextPage()}>{gallery.isFetchingNextPage ? <><LoaderCircle className="animate-spin" /> Cargando…</> : "Cargar más recuerdos"}</Button></div>}

      {selectionMode && (
        <aside className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl rounded-2xl border border-primary/15 bg-background/95 p-3 shadow-[0_18px_50px_rgba(55,27,35,0.3)] backdrop-blur" aria-label="Acciones de selección">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{selectedIds.size} {selectedIds.size === 1 ? "seleccionado" : "seleccionados"}</p>
              <button className="text-xs text-primary underline-offset-4 hover:underline" type="button" onClick={selectAll}>Seleccionar todo{items.length > MAX_SELECTION ? ` (máx. ${MAX_SELECTION})` : ""}</button>
            </div>
            <Button className="h-10 px-3" disabled={!selectedIds.size || preparingDownloads} onClick={() => void downloadSelection()}>
              {preparingDownloads ? <LoaderCircle className="animate-spin" /> : <Download />} <span className="hidden min-[360px]:inline">Descargar</span>
            </Button>
          </div>
          {preparedDownloads.length > 0 && (
            <details className="mt-2 border-t pt-2 text-xs" open>
              <summary className="cursor-pointer font-medium text-primary">Descargas individuales</summary>
              <p className="mt-1 text-[11px] text-muted-foreground">Si el navegador bloqueó alguna descarga, ábrela desde aquí.</p>
              <ul className="mt-1 max-h-24 space-y-1 overflow-auto">
                {preparedDownloads.map(download => <li key={download.id}><a className="block truncate underline underline-offset-2" href={download.url} target="_blank" rel="noopener noreferrer" download={download.filename}>{download.filename}</a></li>)}
              </ul>
            </details>
          )}
        </aside>
      )}

      {!onSelect && <MediaViewer selected={viewerItem} items={items} onSelect={setViewerItem} onClose={closeViewer} />}
    </section>
  );
}
