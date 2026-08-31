import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { GuestGate } from "./GuestGate";
import { albumApi } from "@/lib/album-api";

vi.mock("@/lib/album-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/album-api")>();
  return { ...original, albumApi: { ...original.albumApi, createGuest: vi.fn(), updateGuest: vi.fn() } };
});

describe("GuestGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes the name and creates a guest", async () => {
    vi.mocked(albumApi.createGuest).mockResolvedValue({ guest: { guestId: "g-1", displayName: "María José" } });
    const onCreated = vi.fn();
    render(<GuestGate onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText("Tu nombre"), { target: { value: "  María   José  " } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar al álbum" }));
    await waitFor(() => expect(albumApi.createGuest).toHaveBeenCalledWith("María José"));
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it("shows an accessible validation error", async () => {
    render(<GuestGate onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Entrar al álbum" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("entre 1 y 80");
    expect(albumApi.createGuest).not.toHaveBeenCalled();
  });

  it("edits the name while using the stable identity endpoint", async () => {
    vi.mocked(albumApi.updateGuest).mockResolvedValue({ guest: { guestId: "g-1", displayName: "María nueva" } });
    const onCreated = vi.fn();
    render(<GuestGate editing initialDisplayName="María" onCreated={onCreated} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Tu nombre"), { target: { value: "María nueva" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    await waitFor(() => expect(albumApi.updateGuest).toHaveBeenCalledWith("María nueva"));
    expect(albumApi.createGuest).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledOnce();
  });
});
