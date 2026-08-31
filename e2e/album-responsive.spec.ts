import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const viewports = [
  { label: "390x844", width: 390, height: 844 },
  { label: "430x932", width: 430, height: 932 },
  { label: "768x1024", width: 768, height: 1024 },
  { label: "1440x900", width: 1440, height: 900 },
];

const colors = ["6b2d3a", "b48b55", "806c59", "9c5466", "496354", "d2a56e", "7d424f", "a88c74"];

function thumbnail(index: number) {
  const color = colors[index % colors.length];
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 480 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#${color}"/><stop offset="1" stop-color="#f5ead8"/></linearGradient></defs><rect width="480" height="600" fill="url(#g)"/><circle cx="360" cy="130" r="92" fill="#fff" fill-opacity=".18"/><path d="M-20 500Q130 330 260 470T520 410V640H-20Z" fill="#fff" fill-opacity=".24"/></svg>`)}`;
}

const initialMedia = Array.from({ length: 8 }, (_, index) => ({
  id: `visual-${index}`,
  guestName: index === 3 ? "Álvaro" : index % 2 ? "Lucía" : "Gepete Test",
  originalName: index === 3 ? "brindis.mp4" : `recuerdo-${index}.jpg`,
  mimeType: index === 3 ? "video/mp4" : "image/jpeg",
  size: 2_400_000,
  createdAt: `2026-08-30T12:00:0${index}.000Z`,
  isOwner: index % 2 === 0,
  thumbnailUrl: thumbnail(index),
}));

async function installVisualMock(page: Page) {
  let releaseUpload: (() => void) | null = null;
  let uploadWaiting = false;
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

  await page.route("**/visual-upload/session", async route => {
    if (route.request().method() === "PUT") {
      uploadWaiting = true;
      await new Promise<void>(resolve => { releaseUpload = resolve; });
      return json(route, { id: "visual-uploaded", name: "visual.jpg", size: 5 }, 201);
    }
    if (route.request().method() === "DELETE") return route.fulfill({ status: 204 });
    return json(route, { nextExpectedRanges: ["0-"] });
  });

  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;
    if (apiPath === "/api/album/session") return json(route, { hasAccess: true, guest: { guestId: "visual-guest", displayName: "Gepete Test" } });
    if (apiPath === "/api/album/uploads/policy") return json(route, {
      maxFileBytes: 100_000_000,
      maxBatchFiles: 50,
      chunkBytes: 10 * 1024 * 1024,
      parallelFiles: 2,
      acceptedTypes: ["image/jpeg", "video/mp4"],
      acceptedExtensions: ["jpg", "jpeg", "mp4"],
      genericTypes: ["", "application/octet-stream"],
      typeExtensions: { "image/jpeg": ["jpg", "jpeg"], "video/mp4": ["mp4"] },
    });
    if (apiPath === "/api/album/uploads/session" && request.method() === "POST") return json(route, { mediaId: "visual-upload", storedName: "visual.jpg", uploadUrl: "http://127.0.0.1:5173/visual-upload/session", expiresAt: "2030-01-01T00:00:00Z" }, 201);
    if (apiPath.endsWith("/complete")) return json(route, { mediaId: "visual-upload", status: "visible" });
    if (apiPath.endsWith("/fail")) return route.fulfill({ status: 204 });
    if (apiPath.endsWith("/source")) {
      const isVideo = apiPath.includes("visual-3");
      return json(route, { url: isVideo ? "data:video/mp4;base64,AAAA" : thumbnail(0), filename: isVideo ? "brindis.mp4" : "recuerdo.jpg", mimeType: isVideo ? "video/mp4" : "image/jpeg" });
    }
    if (apiPath === "/api/album/media") return json(route, { items: initialMedia, nextCursor: null });
    return json(route, { error: { code: "VISUAL_MOCK_NOT_FOUND", message: apiPath } }, 404);
  });

  return {
    isUploadWaiting: () => uploadWaiting,
    releaseUpload: () => releaseUpload?.(),
  };
}

for (const viewport of viewports) {
  test(`responsive evidence ${viewport.label}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const upload = await installVisualMock(page);
    const evidenceDir = path.join(process.cwd(), "docs", "album-frontend-refresh", viewport.label);
    await mkdir(evidenceDir, { recursive: true });
    const capture = (name: string) => page.screenshot({ path: path.join(evidenceDir, name), animations: "disabled" });

    await page.goto("/album");
    await expect(page.getByRole("button", { name: "Abrir recuerdo compartido por Gepete Test" }).first()).toBeVisible();
    if (viewport.width < 640) {
      await expect(page.getByTestId("mobile-upload-action")).toBeVisible();
      await expect(page.getByTestId("desktop-upload-dropzone")).toBeHidden();
      const firstTile = await page.getByRole("button", { name: "Abrir recuerdo compartido por Gepete Test" }).first().boundingBox();
      expect(firstTile?.y).toBeLessThan(viewport.height);
    } else {
      await expect(page.getByTestId("desktop-upload-dropzone")).toBeVisible();
    }
    await capture("01-gallery.png");

    if (viewport.width === 390) {
      const firstTile = page.locator('[data-media-id="visual-0"]');
      const secondTile = page.locator('[data-media-id="visual-1"]');
      const firstBox = await firstTile.boundingBox();
      const secondBox = await secondTile.boundingBox();
      expect(firstBox).not.toBeNull();
      expect(secondBox).not.toBeNull();
      await firstTile.dispatchEvent("pointerdown", {
        pointerType: "touch",
        pointerId: 31,
        isPrimary: true,
        clientX: firstBox!.x + firstBox!.width / 2,
        clientY: firstBox!.y + firstBox!.height / 2,
      });
      await expect(page.getByText("1 seleccionado")).toBeVisible({ timeout: 2_000 });
      await firstTile.dispatchEvent("pointermove", {
        pointerType: "touch",
        pointerId: 31,
        isPrimary: true,
        clientX: secondBox!.x + secondBox!.width / 2,
        clientY: secondBox!.y + secondBox!.height / 2,
      });
      await expect(page.getByText("2 seleccionados")).toBeVisible();
      await firstTile.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 31, isPrimary: true });
      await page.getByRole("button", { name: "Cerrar" }).click();
    }

    await page.locator('input[type="file"]').setInputFiles({ name: "nuevo-recuerdo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("photo") });
    await expect.poll(upload.isUploadWaiting).toBe(true);
    const visibleUploadStatus = viewport.width < 640
      ? page.getByText("Subiendo 1 de 1").last()
      : page.getByText("Subiendo 1 de 1").first();
    await expect(visibleUploadStatus).toBeVisible();
    await capture("02-upload-active.png");
    upload.releaseUpload();
    const completionToast = page.getByText("Recuerdo compartido", { exact: true });
    await expect(completionToast).toBeVisible();
    await expect(completionToast).toBeHidden({ timeout: 10_000 });

    await page.getByRole("button", { name: "Seleccionar" }).click();
    await page.getByRole("button", { name: "Seleccionar recuerdo compartido por Gepete Test" }).first().click();
    await page.getByRole("button", { name: "Seleccionar recuerdo compartido por Lucía" }).first().click();
    await expect(page.getByText("2 seleccionados")).toBeVisible();
    await capture("03-selection.png");
    await page.getByRole("button", { name: "Cerrar" }).click();

    await page.getByRole("button", { name: "Abrir recuerdo compartido por Gepete Test" }).first().click();
    await expect(page.getByRole("img", { name: "Recuerdo compartido por Gepete Test" })).toBeVisible();
    await capture("04-photo-viewer.png");
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Abrir recuerdo compartido por Álvaro" }).click();
    await expect(page.locator("video")).toBeVisible();
    await capture("05-video-viewer.png");
  });
}
