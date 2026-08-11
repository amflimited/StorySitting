import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const input = await readFile(resolve(root, ".next/server/app/index.html"), "utf8");
const css = await readFile(resolve(root, "app/globals.css"), "utf8");

let html = input
  // The homepage is pre-rendered. The live .com keeps the proven Python
  // checkout, so it does not need Next hydration or RSC flight payloads.
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/<link\b(?=[^>]*\bas="script")[^>]*\/?\s*>/gi, "")
  .replace(/<link\b(?=[^>]*\bas="image")[^>]*\/?\s*>/gi, "")
  .replace(/<div hidden=""><!--\$--><!--\/\$--><\/div>/, "")
  .replace(/<link rel="stylesheet"[^>]*>/, '<link rel="stylesheet" href="/assets/app-home.css?v=cream-20260811">')
  .replace(/<link rel="manifest"[^>]*>/, "")
  .replace(/\s+srcSet="\/_next\/image\?[^\"]*"/g, "")
  .replace(/src="\/_next\/image\?url=%2Fimages%2F([^&\"]+)&amp;[^\"]*"/g, 'src="/assets/images/$1"')
  .replaceAll("https://app.storysitting.com/images/", "https://storysitting.com/assets/images/")
  .replaceAll('href="/start"', 'href="/start/"')
  .replaceAll('href="/demo"', 'href="/sample/"')
  .replaceAll("App preview", "Source example")
  .replaceAll("Open the interactive app preview →", "Open the source-to-story example →")
  .replaceAll("Walk through the app", "Inspect a finished example")
  .replace(/<a class="nav-login" href="\/login">Sign in<\/a>/, "")
  .replace(/<div class="footer-links"><strong>Your account<\/strong>[\s\S]*?<\/div>/, "")
  .replaceAll("https://storysitting.com/privacy", "https://storysitting.com/privacy.html")
  .replaceAll("https://storysitting.com/terms", "https://storysitting.com/terms.html")
  .replace(
    "</head>",
    '<link rel="canonical" href="https://storysitting.com/"><link rel="icon" href="/favicon.svg" type="image/svg+xml"></head>'
  )
  .replace("<!DOCTYPE html>", "<!doctype html>");

await writeFile(resolve(root, "marketing-site/index.html"), html);
await writeFile(resolve(root, "marketing-site/assets/app-home.css"), css);
