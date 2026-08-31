import { expect, test, type Page, type Route } from "@playwright/test";

const pixel = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%236b2d3a'/%3E%3C/svg%3E";

async function installAlbumMock(page: Page) {
  let hasAccess = false;
  let guest: { guestId: string; displayName: string } | null = null;
  let media: Array<Record<string, unknown>> = [];

  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/mock-onedrive/session", async route => {
    if (route.request().method() === "PUT") return json(route, { id: "drive-item-1", name: "stored-recuerdo.jpg", size: 4 }, 201);
    if (route.request().method() === "DELETE") return route.fulfill({ status: 204 });
    return json(route, { nextExpectedRanges: ["0-"] });
  });

  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/album/access" && request.method() === "POST") {
      hasAccess = true;
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/album/session") return json(route, { hasAccess, guest });
    if (path === "/api/album/guest" && request.method() === "POST") {
      guest = { guestId: "guest-e2e", displayName: (request.postDataJSON() as { displayName: string }).displayName };
      return json(route, { guest }, 201);
    }
    if (path === "/api/album/guest" && request.method() === "PATCH") {
      guest = { guestId: guest?.guestId ?? "guest-e2e", displayName: (request.postDataJSON() as { displayName: string }).displayName };
      return json(route, { guest });
    }
    if (path === "/api/album/uploads/policy") return json(route, {
      maxFileBytes: 10_000_000,
      maxBatchFiles: 50,
      chunkBytes: 10 * 1024 * 1024,
      parallelFiles: 2,
      acceptedTypes: ["image/jpeg", "video/mp4"],
      acceptedExtensions: ["jpg", "jpeg", "mp4"],
      genericTypes: ["", "application/octet-stream"],
      typeExtensions: { "image/jpeg": ["jpg", "jpeg"], "video/mp4": ["mp4"] },
    });
    if (path === "/api/album/uploads/session" && request.method() === "POST") return json(route, { mediaId: "00000000-0000-4000-8000-000000000001", storedName: "stored-recuerdo.jpg", uploadUrl: "http://127.0.0.1:5173/mock-onedrive/session", expiresAt: "2030-01-01T00:00:00Z" }, 201);
    if (path.endsWith("/complete") && request.method() === "POST") {
      media = [
        { id: "00000000-0000-4000-8000-000000000001", guestName: guest?.displayName ?? "Invitada", originalName: "recuerdo.jpg", mimeType: "image/jpeg", size: 4, createdAt: "2026-08-30T12:00:00.000Z", isOwner: true, thumbnailUrl: pixel },
        { id: "00000000-0000-4000-8000-000000000002", guestName: "Otra invitada", originalName: "otro-recuerdo.jpg", mimeType: "image/jpeg", size: 4, createdAt: "2026-08-30T11:00:00.000Z", isOwner: false, thumbnailUrl: pixel },
      ];
      return json(route, { mediaId: "00000000-0000-4000-8000-000000000001", status: "visible" });
    }
    if (path.endsWith("/source")) {
      const second = path.includes("00000000-0000-4000-8000-000000000002");
      return json(route, { url: pixel, filename: second ? "otro-recuerdo.jpg" : "recuerdo.jpg", mimeType: "image/jpeg" });
    }
    if (/^\/api\/album\/media\/[^/]+$/.test(path) && request.method() === "DELETE") {
      const mediaId = path.split("/").at(-1);
      const target = media.find(item => item.id === mediaId);
      if (!target?.isOwner) return json(route, { error: { code: "MEDIA_NOT_FOUND", message: "No se encontró el recuerdo." } }, 404);
      media = media.filter(item => item.id !== mediaId);
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/album/media") {
      const scope = new URL(request.url()).searchParams.get("scope");
      return json(route, { items: scope === "mine" ? media.filter(item => item.isOwner) : media, nextCursor: null });
    }
    if (path.endsWith("/fail")) return route.fulfill({ status: 204 });
    return json(route, { error: { code: "MOCK_NOT_FOUND", message: path } }, 404);
  });
}

test("magic access, guest identity, direct upload, gallery and viewer", async ({ page }) => {
  await installAlbumMock(page);
  await page.goto("/album#access=e2e-private-token");
  await expect(page).toHaveURL(/\/album$/);
  await page.getByLabel("Tu nombre").fill("Invitada E2E");
  await page.getByRole("button", { name: "Entrar al álbum" }).click();
  await expect(page.getByText("Hola,")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({ name: "recuerdo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("foto") });
  await expect(page.getByText("Recuerdo compartido", { exact: true })).toBeVisible();
  const card = page.getByRole("button", { name: "Abrir recuerdo compartido por Invitada E2E" });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("heading", { name: "Recuerdo compartido por Invitada E2E" })).toBeVisible();
  await expect(page.getByText("1 de 2", { exact: true })).toBeVisible();
  await expect(page.getByText("recuerdo.jpg", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Descargar/ })).toHaveAttribute("download", "recuerdo.jpg");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Recuerdo compartido por Invitada E2E" })).toBeHidden();
  await expect(card).toBeFocused();

  await page.getByRole("button", { name: "Seleccionar" }).click();
  await page.getByRole("button", { name: "Seleccionar todo" }).click();
  await expect(page.getByText("2 seleccionados")).toBeVisible();
  await page.getByRole("button", { name: "Descargar" }).click();
  await expect(page.locator('iframe[data-album-download]')).toHaveCount(2);
  await expect(page.getByText("Descargas individuales")).toBeVisible();
  await page.getByRole("button", { name: "Cerrar" }).click();
  await expect(page.getByText("2 seleccionados")).toBeHidden();

  await page.getByRole("button", { name: "Mis recuerdos" }).click();
  await expect(page.getByRole("button", { name: "Abrir recuerdo compartido por Otra invitada" })).toHaveCount(0);
  await page.getByRole("button", { name: "Eliminar recuerdo compartido por Invitada E2E" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("papelera de OneDrive");
  await page.getByRole("button", { name: "Mover a la papelera" }).click();
  await expect(page.getByText("Aún no has compartido ningún recuerdo")).toBeVisible();
});

test("the existing wedding home remains available", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Bienvenida" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Inés.*Martín/ })).toBeVisible();
});
