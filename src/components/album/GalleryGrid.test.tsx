import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { GalleryGrid } from "./GalleryGrid";
import { albumApi, type AlbumMedia } from "@/lib/album-api";

vi.mock("@/lib/album-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/album-api")>();
  return { ...original, albumApi: { ...original.albumApi, media: vi.fn(), mediaSource: vi.fn(), deleteMedia: vi.fn() } };
});

function renderGallery(onSelect = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><GalleryGrid onSelect={onSelect} /></QueryClientProvider>);
  return onSelect;
}

const photo: AlbumMedia = {
  id: "media-1",
  guestName: "Lucía",
  originalName: "baile.jpg",
  mimeType: "image/jpeg",
  size: 500,
  createdAt: "2026-08-30T12:00:00.000Z",
  isOwner: true,
  thumbnailUrl: "https://thumb.example/baile.jpg",
};

const video: AlbumMedia = {
  ...photo,
  id: "media-2",
  guestName: "Álvaro",
  originalName: "baile.mp4",
  mimeType: "video/mp4",
  thumbnailUrl: null,
  createdAt: "2026-08-29T11:00:00.000Z",
  isOwner: false,
};

describe("GalleryGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.querySelectorAll('iframe[data-album-download]').forEach(frame => frame.remove());
  });

  it("keeps attribution accessible without a persistent footer and opens the selected item", async () => {
    vi.mocked(albumApi.media).mockResolvedValue({ items: [photo], nextCursor: null });
    const onSelect = renderGallery();
    const tile = await screen.findByRole("button", { name: "Abrir recuerdo compartido por Lucía" });
    expect(screen.queryByText("Lucía")).not.toBeInTheDocument();
    fireEvent.click(tile);
    expect(onSelect).toHaveBeenCalledWith(photo);
  });

  it("shows an intentional empty state", async () => {
    vi.mocked(albumApi.media).mockResolvedValue({ items: [], nextCursor: null });
    renderGallery();
    expect(await screen.findByText(/primera persona en compartir/)).toBeInTheDocument();
  });

  it("selects up to the gallery limit and starts every selected download without extra steps", async () => {
    vi.mocked(albumApi.media).mockResolvedValue({ items: [photo, video], nextCursor: null });
    vi.mocked(albumApi.mediaSource)
      .mockResolvedValueOnce({ url: "https://download.example/photo", filename: "baile.jpg", mimeType: "image/jpeg" })
      .mockResolvedValueOnce({ url: "https://download.example/video", filename: "baile.mp4", mimeType: "video/mp4" });
    renderGallery();

    fireEvent.click(await screen.findByRole("button", { name: "Seleccionar" }));
    fireEvent.click(screen.getByRole("button", { name: "Seleccionar todo" }));
    expect(screen.getByText("2 seleccionados")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Descargar" }));

    await waitFor(() => expect(albumApi.mediaSource).toHaveBeenCalledTimes(2));
    expect(document.querySelectorAll('iframe[data-album-download]')).toHaveLength(2);
    expect(document.querySelector<HTMLIFrameElement>('iframe[data-album-download="media-1"]')).toHaveAttribute("sandbox", "allow-downloads");
    expect(screen.queryByText(/permiso para descargar varios archivos/)).not.toBeInTheDocument();
    expect(screen.queryByText("Descargas individuales")).not.toBeInTheDocument();
    expect(screen.getByText("2 seleccionados")).toBeInTheDocument();
  });

  it("selects and deselects a tile without opening it", async () => {
    vi.mocked(albumApi.media).mockResolvedValue({ items: [photo], nextCursor: null });
    const onSelect = renderGallery();
    fireEvent.click(await screen.findByRole("button", { name: "Seleccionar" }));
    const tile = screen.getByRole("button", { name: "Seleccionar recuerdo compartido por Lucía" });
    fireEvent.click(tile);
    expect(screen.getByText("1 seleccionado")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Deseleccionar recuerdo compartido por Lucía" }));
    expect(screen.getByText("0 seleccionados")).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("limits select all to twenty items", async () => {
    const manyItems = Array.from({ length: 22 }, (_, index) => ({ ...photo, id: `media-${index}`, originalName: `foto-${index}.jpg` }));
    vi.mocked(albumApi.media).mockResolvedValue({ items: manyItems, nextCursor: null });
    renderGallery();
    fireEvent.click(await screen.findByRole("button", { name: "Seleccionar" }));
    fireEvent.click(screen.getByRole("button", { name: /Seleccionar todo/ }));
    expect(screen.getByText("20 seleccionados")).toBeInTheDocument();
  });

  it("stores the selected visual layout and requests the chosen server order", async () => {
    vi.mocked(albumApi.media).mockResolvedValue({ items: [photo, video], nextCursor: null });
    renderGallery();
    await screen.findByRole("button", { name: "Diseño y orden" });

    fireEvent.pointerDown(screen.getByRole("button", { name: "Diseño y orden" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitemradio", { name: /Cuadrícula/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Abrir recuerdo compartido por Lucía" })).toHaveClass("aspect-square"));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("album-gallery-preferences-v1") ?? "null")).toMatchObject({ layout: "grid" }));

    fireEvent.pointerDown(screen.getByRole("button", { name: "Diseño y orden" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Añadidos primero" }));
    await waitFor(() => expect(albumApi.media).toHaveBeenCalledWith(undefined, "oldest", "all"));
    expect(JSON.parse(window.localStorage.getItem("album-gallery-preferences-v1") ?? "null")).toMatchObject({ layout: "grid", order: "oldest" });
  });

  it("restores the day layout and groups memories under accessible date headings", async () => {
    window.localStorage.setItem("album-gallery-preferences-v1", JSON.stringify({ layout: "day", order: "oldest" }));
    vi.mocked(albumApi.media).mockResolvedValue({ items: [video, photo], nextCursor: null });
    renderGallery();

    expect(await screen.findByRole("heading", { level: 3, name: /29 de agosto de 2026/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: /30 de agosto de 2026/i })).toBeInTheDocument();
    expect(albumApi.media).toHaveBeenCalledWith(undefined, "oldest", "all");
  });

  it("enters selection mode on a long press and selects tiles while dragging", async () => {
    vi.mocked(albumApi.media).mockResolvedValue({ items: [photo, video], nextCursor: null });
    renderGallery();
    const first = await screen.findByRole("button", { name: "Abrir recuerdo compartido por Lucía" });
    const second = screen.getByRole("button", { name: "Abrir recuerdo compartido por Álvaro" });
    const elementFromPoint = vi.spyOn(document, "elementFromPoint").mockReturnValue(second);
    vi.useFakeTimers();

    fireEvent.pointerDown(first, { pointerType: "touch", pointerId: 7, isPrimary: true, clientX: 100, clientY: 100 });
    act(() => vi.advanceTimersByTime(420));
    expect(screen.getByText("1 seleccionado")).toBeInTheDocument();

    fireEvent.pointerMove(first, { pointerType: "touch", pointerId: 7, isPrimary: true, clientX: 150, clientY: 120 });
    expect(screen.getByText("2 seleccionados")).toBeInTheDocument();
    fireEvent.pointerUp(first, { pointerType: "touch", pointerId: 7, isPrimary: true, clientX: 150, clientY: 120 });
    fireEvent.click(first);
    expect(screen.getByText("2 seleccionados")).toBeInTheDocument();

    elementFromPoint.mockRestore();
    vi.useRealTimers();
  });

  it("keeps normal scrolling when the finger moves before the long press threshold", async () => {
    vi.mocked(albumApi.media).mockResolvedValue({ items: [photo], nextCursor: null });
    renderGallery();
    const tile = await screen.findByRole("button", { name: "Abrir recuerdo compartido por Lucía" });
    vi.useFakeTimers();

    fireEvent.pointerDown(tile, { pointerType: "touch", pointerId: 8, isPrimary: true, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(tile, { pointerType: "touch", pointerId: 8, isPrimary: true, clientX: 100, clientY: 125 });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.queryByText("1 seleccionado")).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it("shows owned memories and deletes one only after recycle-bin confirmation", async () => {
    vi.mocked(albumApi.media).mockResolvedValue({ items: [photo], nextCursor: null });
    vi.mocked(albumApi.deleteMedia).mockResolvedValue(undefined);
    renderGallery();
    fireEvent.click(await screen.findByRole("button", { name: "Mis recuerdos" }));
    await waitFor(() => expect(albumApi.media).toHaveBeenCalledWith(undefined, "newest", "mine"));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar recuerdo compartido por Lucía" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("papelera de OneDrive");
    fireEvent.click(screen.getByRole("button", { name: "Mover a la papelera" }));
    await waitFor(() => expect(albumApi.deleteMedia).toHaveBeenCalledWith(photo.id));
  });
});
