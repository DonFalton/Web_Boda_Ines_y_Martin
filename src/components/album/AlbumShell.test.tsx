import { render } from "@testing-library/react";
import { AlbumShell } from "./AlbumShell";

describe("AlbumShell", () => {
  it("marks the album as non-indexable and restores the previous page metadata", () => {
    const existing = document.createElement("meta");
    existing.name = "robots";
    existing.content = "index, follow";
    document.head.append(existing);
    const view = render(<AlbumShell><p>Contenido privado</p></AlbumShell>);
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow, noarchive");
    view.unmount();
    expect(existing).toHaveAttribute("content", "index, follow");
    existing.remove();
  });
});
