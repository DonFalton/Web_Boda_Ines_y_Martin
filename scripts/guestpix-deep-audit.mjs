import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const target = process.env.GUESTPIX_URL;
if (!target) throw new Error("GUESTPIX_URL is required");
const targetParts = new URL(target).pathname.split("/").filter(Boolean);
const sensitive = new Set(targetParts.slice(-2));
const auditRoot = path.resolve("docs/guestpix-audit");
const evidenceRoot = path.join(auditRoot, "evidence");
const dummyRoot = path.join(auditRoot, "dummy");
await fs.mkdir(evidenceRoot, { recursive: true });
await fs.mkdir(dummyRoot, { recursive: true });

function safeJson(value) {
  let output = JSON.stringify(value, null, 2);
  for (const part of sensitive) output = output.replaceAll(part, part === targetParts.at(-1) ? "{secretToken}" : "{eventId}");
  return output;
}

function redact(raw) {
  try {
    const u = new URL(raw);
    u.pathname = u.pathname.split("/").map(p => sensitive.has(decodeURIComponent(p)) ? "{redacted}" : p).join("/");
    for (const k of [...u.searchParams.keys()]) u.searchParams.set(k, "{redacted}");
    return u.toString();
  } catch { return "{unparseable-url}"; }
}

function safeHeaders(headers) {
  const names = new Set(["cache-control", "content-type", "content-length", "content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy", "permissions-policy", "strict-transport-security"]);
  return Object.fromEntries(Object.entries(headers).filter(([k]) => names.has(k.toLowerCase())));
}

async function createDummyFiles(browser) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  await page.setContent(`<!doctype html><style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#ece7dc;font-family:Arial,sans-serif}
    body{display:grid;place-items:center;background:linear-gradient(135deg,#0b3554,#b7964b 50%,#ead8c0)}
    .card{width:900px;height:620px;display:grid;place-items:center;text-align:center;border:20px solid white;box-shadow:0 25px 80px #0006;background:repeating-linear-gradient(45deg,#f8f4ed,#f8f4ed 20px,#d9c19f 20px,#d9c19f 40px)}
    h1{font-size:72px;color:#0b3554;margin:0}.small{font-size:30px;color:#633} 
  </style><div class="card"><div><h1>CODEX AUDIT DUMMY</h1><p class="small">GUESTPIX functional test · no personal media</p></div></div>`);
  const card = page.locator(".card");
  const jpg = path.join(dummyRoot, "codex-test-photo-01.jpg");
  const png = path.join(dummyRoot, "codex-test-photo-02.png");
  await card.screenshot({ path: jpg, type: "jpeg", quality: 94 });
  await card.screenshot({ path: png, type: "png" });
  await context.close();
  return [jpg, png];
}

async function state(page, label) {
  const visibleImages = await page.locator("img:visible").evaluateAll(imgs => imgs.map(i => ({
    alt: i.getAttribute("alt"),
    loading: i.getAttribute("loading"),
    width: Math.round(i.getBoundingClientRect().width),
    height: Math.round(i.getBoundingClientRect().height),
    sourceKind: (i.currentSrc || i.src).includes("/Pix/") ? "event-media" : "ui",
  })));
  return {
    label,
    url: redact(page.url()),
    title: await page.title(),
    bodyText: (await page.locator("body").innerText()).slice(0, 30000),
    headings: await page.locator("h1,h2,h3,h4").allTextContents(),
    buttons: await page.getByRole("button").allTextContents(),
    inputs: await page.locator("input").evaluateAll(els => els.map(e => ({ type: e.type, name: e.name, placeholder: e.placeholder, required: e.required, minLength: e.minLength, maxLength: e.maxLength, accept: e.accept, multiple: e.multiple, capture: e.capture, checked: e.checked }))),
    visibleImages,
    storage: await page.evaluate(async () => ({ localStorageKeys: Object.keys(localStorage), sessionStorageKeys: Object.keys(sessionStorage), indexedDBNames: indexedDB.databases ? (await indexedDB.databases()).map(x => x.name) : [], jsCookieNames: document.cookie.split(";").map(x => x.split("=")[0]?.trim()).filter(Boolean) })),
  };
}

async function layout(page, label) {
  return page.evaluate((label) => {
    const media = [...document.querySelectorAll('img[src*="/Pix/"]')].filter(e => {
      const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
    });
    const boxes = media.map(e => { const r=e.getBoundingClientRect(); return { x:Math.round(r.x), y:Math.round(r.y), width:Math.round(r.width), height:Math.round(r.height) }; });
    const firstY = boxes.length ? Math.min(...boxes.map(b => b.y)) : null;
    const firstRow = firstY == null ? [] : boxes.filter(b => Math.abs(b.y-firstY) < 12);
    const fixed = [...document.querySelectorAll("body *")].filter(e => getComputedStyle(e).position === "fixed").map(e => ({ tag:e.tagName, text:(e.textContent||"").trim().slice(0,80) }));
    return { label, viewport:{width:innerWidth,height:innerHeight}, mediaCount:boxes.length, columns:new Set(boxes.map(b=>b.x)).size, firstRowColumns:new Set(firstRow.map(b=>b.x)).size, firstRow, fixed };
  }, label);
}

async function keyboardSample(page) {
  const result=[];
  for (let i=0;i<10;i++) {
    await page.keyboard.press("Tab");
    result.push(await page.evaluate(() => { const e=document.activeElement; return {tag:e?.tagName, text:(e?.textContent||"").trim().slice(0,60), name:e?.getAttribute?.("name"), aria:e?.getAttribute?.("aria-label")}; }));
  }
  return result;
}

async function login(page, log, outPath) {
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90000 });
  const nameInput = page.locator('input[name="name"]');
  await nameInput.waitFor({ state: "visible", timeout: 60000 });
  await page.waitForTimeout(1500);
  log.states.push(await state(page, "entry"));
  log.entryKeyboard = await keyboardSample(page);
  await nameInput.focus();
  const continueButton = page.getByRole("button", { name: /continuar/i });
  await continueButton.click();
  await page.waitForTimeout(500);
  log.states.push(await state(page, "empty-name"));
  log.emptyNameValidity = await nameInput.evaluate(e => ({ valid:e.validity.valid, valueMissing:e.validity.valueMissing, validationMessage:e.validationMessage, ariaInvalid:e.getAttribute("aria-invalid") }));
  await nameInput.fill("Gepete");
  await page.screenshot({ path: path.join(outPath, "02-name-filled.png"), fullPage: true });
  await nameInput.press("Enter");
  await page.waitForURL(u => /\/guest\/[^/]+\/?(?:\?|$)/.test(u.pathname+u.search) && !u.pathname.includes("/access/"), { timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  log.states.push(await state(page, "home-gallery"));
  await page.screenshot({ path: path.join(outPath, "03-home-gallery.png"), fullPage: true });
}

async function inspectViewer(page, log, outPath) {
  const media = page.locator('img[src*="/Pix/"]:visible');
  log.galleryVisibleMediaCount = await media.count();
  if (!await media.count()) return;
  await media.first().click();
  await page.waitForTimeout(800);
  log.states.push(await state(page, "viewer-open"));
  await page.screenshot({ path: path.join(outPath, "06-viewer.png"), fullPage: true });
  log.viewerKeyboard = await keyboardSample(page);
  const downloadAction = page.getByRole("button").or(page.getByRole("link")).filter({hasText:/descargar|download/i}).first();
  if (await downloadAction.count()) {
    log.download = { visible:true, text:await downloadAction.innerText() };
    const downloadPromise = page.waitForEvent("download", {timeout:10000}).catch(()=>null);
    await downloadAction.click().catch(()=>{});
    const dl = await downloadPromise;
    if (dl) log.download = { visible:true, triggered:true, suggestedFilename:dl.suggestedFilename() };
  } else log.download = { visible:false };
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  const overlay = page.locator('[data-test="base_modal"]:visible');
  log.viewerEscapeClosed = await overlay.count() === 0;
  if (await overlay.count()) {
    await overlay.locator("button").first().click().catch(()=>{});
    await page.waitForTimeout(400);
  }
  log.states.push(await state(page, "after-viewer-escape"));
}

async function inspectUpload(page, log, outPath, files) {
  const exactUpload = page.getByRole("button", { name: /^cargar$/i }).first();
  const fallback = page.getByRole("button", { name: /cargar fotos/i }).first();
  const action = await exactUpload.count() ? exactUpload : fallback;
  await action.click();
  await page.waitForTimeout(800);
  log.states.push(await state(page, "upload-modal-empty"));
  log.urlWithUploadOpen = redact(page.url());
  await page.screenshot({ path: path.join(outPath, "04-upload-empty.png"), fullPage: true });
  const fileInput = page.locator('input[type="file"]:not([webkitdirectory])').last();
  await fileInput.setInputFiles(files);
  log.states.push(await state(page, "upload-files-selected-immediate"));
  await page.screenshot({ path: path.join(outPath, "04-upload-selected.png"), fullPage: true });
  await page.waitForTimeout(1000);
  const modalUpload = page.getByRole("button").filter({hasText:/upload|cargar|subir/i}).last();
  if (await modalUpload.count() && await modalUpload.isVisible().catch(()=>false)) {
    const text = (await modalUpload.innerText()).trim();
    if (!/^cargar$/i.test(text) || page.url().includes("upload")) await modalUpload.click().catch(()=>{});
  }
  await page.waitForTimeout(12000);
  log.states.push(await state(page, "upload-after-wait"));
  await page.screenshot({ path: path.join(outPath, "04-upload-result.png"), fullPage: true });
  log.uploadRequests = log.requests.filter(r => r.at >= log.uploadOpenedAt && ["POST","PUT","PATCH"].includes(r.method));
}

async function runProfile(browser, profile, files, shouldUpload) {
  const outPath = path.join(auditRoot, profile.outDir);
  await fs.mkdir(outPath, { recursive:true });
  const context = await browser.newContext({ viewport:profile.viewport, locale:"es-ES", timezoneId:"Europe/Madrid", isMobile:profile.mobile, hasTouch:profile.mobile, acceptDownloads:true });
  const page = await context.newPage();
  const log = { profile:profile.name, viewport:profile.viewport, requests:[], responses:[], navigations:[], states:[] };
  const started = Date.now();
  page.on("framenavigated", f => { if(f===page.mainFrame()) log.navigations.push(redact(f.url())); });
  page.on("request", r => { if(["document","xhr","fetch","image","media"].includes(r.resourceType())) log.requests.push({at:Date.now()-started, method:r.method(), type:r.resourceType(), url:redact(r.url()), bodyBytes:r.postDataBuffer()?.length||0}); });
  page.on("response", r => { if(["document","xhr","fetch","image","media"].includes(r.request().resourceType())) log.responses.push({status:r.status(), type:r.request().resourceType(), url:redact(r.url()), headers:safeHeaders(r.headers())}); });
  try {
    await login(page, log, outPath);
    log.layouts = [];
    for (const width of [390,412,639,640,767,768,1023,1024,1440,1920]) {
      await page.setViewportSize({width,height:profile.mobile ? 915 : 900});
      await page.waitForTimeout(150);
      log.layouts.push(await layout(page, `width-${width}`));
    }
    await page.setViewportSize(profile.viewport);
    await inspectViewer(page, log, outPath);
    if (shouldUpload) {
      log.uploadOpenedAt = Date.now()-started;
      await inspectUpload(page, log, outPath, files);
    }
    await page.reload({waitUntil:"networkidle",timeout:60000}).catch(()=>{});
    await page.waitForTimeout(1000);
    log.states.push(await state(page,"reload-same-session"));
    await page.goto(target,{waitUntil:"networkidle",timeout:60000}).catch(()=>{});
    await page.waitForTimeout(1000);
    log.states.push(await state(page,"magic-link-again-same-session"));
    log.cookies = (await context.cookies()).map(c=>({name:c.name,domain:c.domain,path:c.path,expires:c.expires,httpOnly:c.httpOnly,secure:c.secure,sameSite:c.sameSite}));
  } catch(error) {
    log.error=String(error?.stack||error);
    await page.screenshot({path:path.join(outPath,"deep-error.png"),fullPage:true}).catch(()=>{});
  } finally {
    await fs.writeFile(path.join(evidenceRoot,`${profile.name}.json`),safeJson(log));
    await context.close();
  }
}

const browser = await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
const files = await createDummyFiles(browser);
await runProfile(browser,{name:"chromium-desktop-1920",viewport:{width:1920,height:1080},mobile:false,outDir:"desktop"},files,true);
if (!process.env.ONLY_UPLOAD) {
  await runProfile(browser,{name:"chromium-android-412",viewport:{width:412,height:915},mobile:true,outDir:"mobile"},files,false);
}

if (!process.env.ONLY_UPLOAD) {
  const fresh = await browser.newContext({viewport:{width:390,height:844},locale:"es-ES"});
  const freshPage = await fresh.newPage();
  await freshPage.goto(target,{waitUntil:"domcontentloaded",timeout:60000});
  await freshPage.locator('input[name="name"]').waitFor({state:"visible",timeout:30000}).catch(()=>{});
  await fs.writeFile(path.join(evidenceRoot,"fresh-context-check.json"),safeJson({url:redact(freshPage.url()),asksForName:await freshPage.locator('input[name="name"]:visible').count()>0,storage:await freshPage.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)}))}));
  await fresh.close();
}
await browser.close();
