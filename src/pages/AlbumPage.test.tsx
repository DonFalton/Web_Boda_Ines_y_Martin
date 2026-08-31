import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";
import AlbumPage from "./AlbumPage";
import { albumApi } from "@/lib/album-api";

vi.mock("@/lib/album-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/album-api")>();
  return {
    ...original,
    albumApi: {
      ...original.albumApi,
      exchangeAccess: vi.fn(),
      session: vi.fn(),
      clearGuest: vi.fn(),
    },
  };
});

describe("AlbumPage", () => {
  it("removes the magic fragment before exchanging it", async () => {
    window.history.replaceState(null, "", "/album#access=private-token");
    vi.mocked(albumApi.exchangeAccess).mockResolvedValue(undefined);
    vi.mocked(albumApi.session).mockResolvedValue({ hasAccess: true, guest: { guestId: "g-1", displayName: "Ana" } });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><AlbumPage /></QueryClientProvider>);
    await waitFor(() => expect(albumApi.exchangeAccess).toHaveBeenCalledWith("private-token"));
    expect(window.location.hash).toBe("");
    expect(setItem).not.toHaveBeenCalled();
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    setItem.mockRestore();
  });
});
