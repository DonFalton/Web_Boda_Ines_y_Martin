import { chromium, webkit } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const target = process.env.GUESTPIX_URL;
if (!target) throw new Error("GUESTPIX_URL is required");
const targetParts = new URL(target).pathname.split("/").filter(Boolean);
const sensitiveSegments = new Set(targetParts.slice(-2));

function safeJson(value) {
  let output = JSON.stringify(value, null, 2);
  for (const part of sensitiveSegments) output = output.replaceAll(part, part === targetParts.at(-1) ? "{secretToken}" : "{eventId}");
  return output;
}

const root = path.resolve("docs/guestpix-audit");
await fs.mkdir(path.join(root, "desktop"), { recursive: true });
await fs.mkdir(path.join(root, "mobile"), { recursive: true });
await fs.mkdir(path.join(root, "evidence"), { recursive: true });

function redactedUrl(raw) {
  try {
    const u = new URL(raw);
    const parts = u.pathname.split("/");
    u.pathname = parts.map(p => sensitiveSegments.has(decodeURIComponent(p)) ? "{redacted}" : p).join("/");
    for (const k of [...u.searchParams.keys()]) u.searchParams.set(k, "{redacted}");
    return u.toString();
  } catch { return "{unparseable-url}"; }
}

function safeHeaders(headers) {
  const allow = ["content-type", "content-length", "cache-control", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "strict-transport-security", "robots"];
  return Object.fromEntries(Object.entries(headers).filter(([k]) => allow.includes(k.toLowerCase())));
}

async function snapshot(page, label) {
  const rawLinks = await page.getByRole("link").evaluateAll(els => els.map(e => ({ text: e.textContent?.trim(), href: e.getAttribute("href") })));
  return {
    label,
    url: redactedUrl(page.url()),
    title: await page.title(),
    text: (await page.locator("body").innerText()).slice(0, 20000),
    headings: await page.locator("h1,h2,h3").allTextContents(),
    buttons: await page.getByRole("button").allTextContents(),
    links: rawLinks.map(link => ({ ...link, href: link.href ? redactedUrl(new URL(link.href, page.url()).toString()) : null })),
    inputs: await page.locator("input").evaluateAll(els => els.map(e => ({ type: e.type, name: e.name, placeholder: e.placeholder, required: e.required, minLength: e.minLength, maxLength: e.maxLength, accept: e.accept, multiple: e.multiple, capture: e.capture }))),
    storage: await page.evaluate(async () => ({
      localStorage: Object.keys(localStorage),
      sessionStorage: Object.keys(sessionStorage),
      indexedDB: indexedDB.databases ? (await indexedDB.databases()).map(x => x.name) : [],
      cookieNamesVisibleToJS: document.cookie.split(";").map(x => x.split("=")[0]?.trim()).filter(Boolean),
    })),
  };
}

async function runOne(browserType, name, viewport, outDir) {
  const launchOptions = browserType === chromium
    ? { headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" }
    : { headless: true };
  const browser = await browserType.launch(launchOptions);
  const context = await browser.newContext({ viewport, locale: "es-ES", timezoneId: "Europe/Madrid", acceptDownloads: true });
  const page = await context.newPage();
  const log = { name, viewport, navigations: [], requests: [], responses: [], console: [], snapshots: [], cookies: [] };
  page.on("framenavigated", f => { if (f === page.mainFrame()) log.navigations.push(redactedUrl(f.url())); });
  page.on("request", req => {
    const type = req.resourceType();
    if (["document", "xhr", "fetch", "image", "media"].includes(type)) log.requests.push({ method: req.method(), type, url: redactedUrl(req.url()), postDataSize: req.postDataBuffer()?.length ?? 0 });
  });
  page.on("response", res => {
    const type = res.request().resourceType();
    if (["document", "xhr", "fetch", "image", "media"].includes(type)) log.responses.push({ status: res.status(), type, url: redactedUrl(res.url()), headers: safeHeaders(res.headers()) });
  });
  page.on("console", msg => log.console.push({ type: msg.type(), text: msg.text().slice(0, 1000) }));

  try {
    await page.goto(target, { waitUntil: "networkidle", timeout: 90000 });
    log.snapshots.push(await snapshot(page, "initial"));
    await page.screenshot({ path: path.join(root, outDir, "01-entry.png"), fullPage: true });

    const nameInput = page.locator('input[type="text"], input:not([type])').first();
    if (await nameInput.count()) {
      // Capture empty validation without submitting potentially destructive data.
      const submit = page.getByRole("button").filter({ hasText: /continue|enter|join|view|submit|next|go|access|start/i }).first();
      if (await submit.count()) {
        await submit.click().catch(() => {});
        await page.waitForTimeout(500);
        log.snapshots.push(await snapshot(page, "empty-name-validation"));
      }
      await nameInput.fill("Invitado de prueba");
      await page.screenshot({ path: path.join(root, outDir, "02-name.png"), fullPage: true });
      await nameInput.press("Enter").catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1200);
      log.snapshots.push(await snapshot(page, "after-name-enter"));
      await page.screenshot({ path: path.join(root, outDir, "03-home.png"), fullPage: true });
    }

    // Explore gallery/view buttons non-destructively.
    const galleryAction = page.getByRole("button").or(page.getByRole("link")).filter({ hasText: /gallery|photos|view|album|galer|fotos/i }).first();
    if (await galleryAction.count()) {
      await galleryAction.click().catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1000);
      log.snapshots.push(await snapshot(page, "gallery"));
      await page.screenshot({ path: path.join(root, outDir, "05-gallery.png"), fullPage: true });
    }

    // Inspect the upload trigger and file input, but do not select anything in this pass.
    const uploadAction = page.getByRole("button").or(page.getByRole("link")).filter({ hasText: /upload|add|share|subir|añadir/i }).first();
    if (await uploadAction.count()) {
      await uploadAction.click().catch(() => {});
      await page.waitForTimeout(700);
      log.snapshots.push(await snapshot(page, "upload-open"));
      await page.screenshot({ path: path.join(root, outDir, "04-upload.png"), fullPage: true });
    }

    log.cookies = (await context.cookies()).map(c => ({ name: c.name, domain: c.domain, path: c.path, expires: c.expires, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite }));
  } catch (error) {
    log.error = String(error?.stack || error);
    await page.screenshot({ path: path.join(root, outDir, "error.png"), fullPage: true }).catch(() => {});
  } finally {
    await fs.writeFile(path.join(root, "evidence", `${name}.json`), safeJson(log));
    await browser.close();
  }
}

await runOne(chromium, "chromium-desktop-1440", { width: 1440, height: 900 }, "desktop");
await runOne(chromium, "chromium-mobile-390", { width: 390, height: 844 }, "mobile");
await runOne(webkit, "webkit-mobile-390", { width: 390, height: 844 }, "mobile");
