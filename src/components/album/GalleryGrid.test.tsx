import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import { GalleryGrid } from "./GalleryGrid";
import { albumApi, type AlbumMedia } from "@/lib/album-api";

vi.mock("@/lib/album-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/album-api")>();
  return { ...original, albumApi: { ...original.albumApi, media: vi.fn() } };
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
  thumbnailUrl: "https://thumb.example/baile.jpg",
};

describe("GalleryGrid", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders media attribution and opens the selected item", async () => {
    vi.mocked(albumApi.media).mockResolvedValue({ items: [photo], nextCursor: null });
    const onSelect = renderGallery();
    expect(await screen.findByText("Lucía")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Abrir baile\.jpg/ }));
    expect(onSelect).toHaveBeenCalledWith(photo);
  });

  it("shows an intentional empty state", async () => {
    vi.mocked(albumApi.media).mockResolvedValue({ items: [], nextCursor: null });
    renderGallery();
    expect(await screen.findByText(/primera persona en compartir/)).toBeInTheDocument();
  });
});
