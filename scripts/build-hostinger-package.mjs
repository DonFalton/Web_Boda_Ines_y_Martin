import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const release = path.join(root, "release", "hostinger-staging");
const publicRoot = path.join(release, "public_html");
const privateRoot = path.join(release, "album-app");

await rm(release, { recursive: true, force: true });
await mkdir(publicRoot, { recursive: true });
await mkdir(privateRoot, { recursive: true });
await cp(path.join(root, "dist"), publicRoot, { recursive: true });
await cp(path.join(root, "hostinger-php", "public", "api"), path.join(publicRoot, "api"), { recursive: true });
await cp(path.join(root, "hostinger-php", "public", ".htaccess.example"), path.join(publicRoot, ".htaccess"));
await cp(path.join(root, "hostinger-php", "app"), path.join(privateRoot, "app"), { recursive: true });
await cp(path.join(root, "hostinger-php", "config.example.php"), path.join(privateRoot, "config.example.php"));

const files = await readdir(publicRoot);
if (!files.includes("index.html") || !files.includes("api") || !files.includes(".htaccess")) {
  throw new Error("Hostinger package is incomplete.");
}
console.log("Hostinger staging package created at release/hostinger-staging (without secrets).");
