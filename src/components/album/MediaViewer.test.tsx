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
  { id: "one", guestName: "Ana", originalName: "ceremonia.jpg", mimeType: "image/jpeg", size: 10, createdAt: "2026-08-30T10:00:00Z", thumbnailUrl: null },
  { id: "two", guestName: "Luis", originalName: "baile.mp4", mimeType: "video/mp4", size: 20, createdAt: "2026-08-30T11:00:00Z", thumbnailUrl: null },
];

describe("MediaViewer", () => {
  it("loads a temporary source and supports download and keyboard navigation", async () => {
    vi.mocked(albumApi.mediaSource).mockResolvedValue({ url: "https://download.example/one", filename: "ceremonia.jpg", mimeType: "image/jpeg" });
    const onSelect = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MediaViewer selected={items[0]} items={items} onSelect={onSelect} onClose={vi.fn()} /></QueryClientProvider>);
    expect(await screen.findByRole("img", { name: "ceremonia.jpg" })).toHaveAttribute("src", "https://download.example/one");
    expect(screen.getByRole("link", { name: /Descargar/ })).toHaveAttribute("download", "ceremonia.jpg");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith(items[1]);
    expect(screen.getByRole("button", { name: "Recuerdo anterior" })).toBeDisabled();
  });
});
