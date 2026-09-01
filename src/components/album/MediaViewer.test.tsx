import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { MediaViewer } from "./MediaViewer";
import { albumApi, type AlbumMedia } from "@/lib/album-api";

vi.mock("@/lib/album-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/album-api")>();
  return { ...original, albumApi: { ...original.albumApi, mediaSource: vi.fn() } };
});

const items: AlbumMedia[] = [
  { id: "one", guestName: "Ana", originalName: "ceremonia.jpg", mimeType: "image/jpeg", size: 10, capturedAt: "2026-08-30T09:00:00.000Z", captureSource: "embedded", createdAt: "2026-08-30T10:00:00Z", isOwner: true, thumbnailUrl: null },
  { id: "two", guestName: "Luis", originalName: "baile.mp4", mimeType: "video/mp4", size: 20, capturedAt: "2026-08-30T09:30:00.000Z", captureSource: "embedded", createdAt: "2026-08-30T11:00:00Z", isOwner: false, thumbnailUrl: null },
];

describe("MediaViewer", () => {
  it("loads a temporary source and supports download and keyboard navigation", async () => {
    vi.mocked(albumApi.mediaSource).mockResolvedValue({ url: "https://download.example/one", filename: "ceremonia.jpg", mimeType: "image/jpeg" });
    const onSelect = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MediaViewer selected={items[0]} items={items} onSelect={onSelect} onClose={vi.fn()} /></QueryClientProvider>);
    expect(await screen.findByRole("img", { name: "Recuerdo compartido por Ana" })).toHaveAttribute("src", "https://download.example/one");
    expect(screen.queryByText("ceremonia.jpg")).not.toBeInTheDocument();
    expect(screen.getByText("Por Ana")).toBeInTheDocument();
    expect(screen.getByText("1 de 2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Descargar/ })).toHaveAttribute("download", "ceremonia.jpg");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith(items[1]);
    expect(screen.getByRole("button", { name: "Recuerdo anterior" })).toBeDisabled();
  });

  it("navigates a photo with a horizontal swipe and ignores short gestures", async () => {
    vi.mocked(albumApi.mediaSource).mockResolvedValue({ url: "https://download.example/one", filename: "ceremonia.jpg", mimeType: "image/jpeg" });
    const onSelect = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MediaViewer selected={items[0]} items={items} onSelect={onSelect} onClose={vi.fn()} /></QueryClientProvider>);
    const surface = (await screen.findByRole("img", { name: "Recuerdo compartido por Ana" })).parentElement!;
    fireEvent.pointerDown(surface, { isPrimary: true, clientX: 240, clientY: 200 });
    fireEvent.pointerUp(surface, { isPrimary: true, clientX: 210, clientY: 202 });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.pointerDown(surface, { isPrimary: true, clientX: 240, clientY: 200 });
    fireEvent.pointerUp(surface, { isPrimary: true, clientX: 170, clientY: 205 });
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it("uses the native fullscreen video experience without exposing its filename", async () => {
    vi.mocked(albumApi.mediaSource).mockResolvedValue({ url: "https://download.example/two", filename: "baile.mp4", mimeType: "video/mp4" });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(<QueryClientProvider client={client}><MediaViewer selected={items[1]} items={items} onSelect={vi.fn()} onClose={vi.fn()} /></QueryClientProvider>);
    const video = await screen.findByText("Tu navegador no puede reproducir este vídeo.");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveProperty("autoplay", true);
    expect(video).toHaveProperty("muted", true);
    expect(screen.queryByText("baile.mp4")).not.toBeInTheDocument();
    expect(container.ownerDocument.querySelector('[role="dialog"]')).toHaveClass("h-[100dvh]");
  });
});
