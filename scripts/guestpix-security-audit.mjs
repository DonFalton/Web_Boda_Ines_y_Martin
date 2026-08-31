import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";

const target = process.env.GUESTPIX_URL;
if (!target) throw new Error("GUESTPIX_URL is required");
const parts = new URL(target).pathname.split("/").filter(Boolean).slice(-2);
const safe = value => {
  let output = JSON.stringify(value, null, 2);
  output = output.replaceAll(parts[0], "{eventId}").replaceAll(parts[1], "{secretToken}");
  return output;
};
const browser = await chromium.launch({ headless:true, executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" });
const context = await browser.newContext({ viewport:{width:390,height:844}, locale:"es-ES" });
const page = await context.newPage();
const response = await page.goto(target,{waitUntil:"domcontentloaded",timeout:60000});
await page.locator('input[name="name"]').waitFor({state:"visible",timeout:30000});
const result = {
  documentHeaders: response ? Object.fromEntries(Object.entries(response.headers()).filter(([k]) => ["cache-control","content-type","content-security-policy","x-frame-options","x-content-type-options","x-robots-tag","referrer-policy","permissions-policy","strict-transport-security"].includes(k.toLowerCase()))) : {},
  meta: await page.locator("meta").evaluateAll(ms=>ms.map(m=>({name:m.getAttribute("name"),httpEquiv:m.getAttribute("http-equiv"),content:m.getAttribute("content")})).filter(x=>x.name||x.httpEquiv)),
  formCount: await page.locator("form").count(),
  labels: await page.locator("label").evaluateAll(ls=>ls.map(l=>({for:l.htmlFor,text:(l.textContent||"").trim()}))),
  serviceWorkers: await page.evaluate(async()=>navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).map(r=>r.scope) : []),
};
const robots = await context.request.get("https://my.guestpix.com/robots.txt");
const robotsBody = await robots.text();
result.robots = {
  status:robots.status(),
  contentType:robots.headers()["content-type"],
  appearsToBeHtmlShell:/<!doctype html|<html/i.test(robotsBody),
  hasUserAgentDirective:/^\s*user-agent\s*:/im.test(robotsBody),
  hasDisallowDirective:/^\s*disallow\s*:/im.test(robotsBody),
};
const internalUrl = new URL(target);
internalUrl.pathname = `/guest/${parts[0]}`;
internalUrl.search = "";
const internalPage = await context.newPage();
await internalPage.goto(internalUrl.toString(),{waitUntil:"networkidle",timeout:60000}).catch(()=>{});
result.internalUrlInFreshContext = {
  finalUrl:internalPage.url(),
  title:await internalPage.title(),
  text:(await internalPage.locator("body").innerText()).replace(/\s+/g," ").slice(0,1000),
  inputs:await internalPage.locator("input").evaluateAll(ins=>ins.map(i=>({name:i.name,type:i.type,placeholder:i.placeholder}))),
};
await fs.writeFile(path.resolve("docs/guestpix-audit/evidence/security-entry.json"),safe(result));
await context.close();
await browser.close();
