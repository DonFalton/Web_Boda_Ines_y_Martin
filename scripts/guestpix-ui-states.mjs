import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
const target=process.env.GUESTPIX_URL;
if(!target) throw new Error("GUESTPIX_URL is required");
const parts=new URL(target).pathname.split("/").filter(Boolean).slice(-2);
const clean=v=>{let s=JSON.stringify(v,null,2);return s.replaceAll(parts[0],"{eventId}").replaceAll(parts[1],"{secretToken}")};
const browser=await chromium.launch({headless:true,executablePath:"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:"es-ES"});
const page=await context.newPage();
const out=path.resolve("docs/guestpix-audit/mobile");
const data={states:[]};
const snap=async label=>data.states.push({label,url:page.url(),text:(await page.locator("body").innerText()).replace(/\s+/g," ").slice(0,10000),buttons:await page.getByRole("button").allTextContents(),headings:await page.locator("h1,h2,h3").allTextContents()});
await page.goto(target,{waitUntil:"domcontentloaded",timeout:60000});
await page.locator('input[name="name"]').fill("Gepete");
await page.locator('input[name="name"]').press("Enter");
await page.waitForURL(u=>!u.pathname.includes("/access/"),{timeout:60000});
await page.waitForLoadState("networkidle",{timeout:30000}).catch(()=>{});
await page.waitForTimeout(1200);

const filters=page.getByText("Filtros",{exact:true}).first();
if(await filters.count()){await filters.click().catch(()=>{});await page.waitForTimeout(400);await snap("filters");await page.screenshot({path:path.join(out,"07-filters.png"),fullPage:true});await page.keyboard.press("Escape");await page.waitForTimeout(300);const overlay=page.locator('[data-test="base_modal"]:visible');if(await overlay.count())await overlay.locator("button").first().click().catch(()=>{});}

const news=page.getByText("Noticias",{exact:true}).first();
if(await news.count()){await news.click().catch(()=>{});await page.waitForTimeout(700);await snap("news-view");await page.screenshot({path:path.join(out,"08-news.png"),fullPage:true});}

const book=page.getByText("LIBRO DE INVITADOS",{exact:false}).first();
if(await book.count()){await book.click().catch(()=>{});await page.waitForTimeout(700);await snap("guestbook");await page.screenshot({path:path.join(out,"09-guestbook.png"),fullPage:true});}

const menu=page.getByRole("button",{name:/menú/i}).last();
if(await menu.count()){await menu.click({force:true}).catch(()=>{});await page.waitForTimeout(300);await snap("mobile-menu");await page.screenshot({path:path.join(out,"10-menu.png"),fullPage:true});}
await fs.writeFile(path.resolve("docs/guestpix-audit/evidence/ui-states-mobile.json"),clean(data));
await context.close();await browser.close();
