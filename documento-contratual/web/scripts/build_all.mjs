import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(webDir, "..");

console.log("[1/3] Typechecking TypeScript...");
execSync("npx tsc --noEmit", { cwd: webDir, stdio: "inherit" });

console.log("[2/3] Building modular Web/PWA bundle into docs/...");
execSync("npx vite build", { cwd: webDir, stdio: "inherit" });

console.log("[3/3] Building 100% self-contained Abrir_Sistema_Vooalto.html...");
execSync("npx vite build", {
  cwd: webDir,
  stdio: "inherit",
  env: { ...process.env, SINGLE_FILE: "1" },
});

const tmpDir = path.join(webDir, ".singlefile-tmp");
let html = fs.readFileSync(path.join(tmpDir, "index.html"), "utf8");

// Embute o motor WASM SIMD LSTM + modelo neural Português (por.traineddata.gz) em Base64 puro
// para funcionar 100% offline até via file:/// sem nenhum servidor ou instalação
const coreJsB64 = fs
  .readFileSync(path.join(webDir, "public/ocr/tesseract-core-simd-lstm.wasm.js"))
  .toString("base64");
const porGzB64 = fs
  .readFileSync(path.join(webDir, "public/ocr/por.traineddata.gz"))
  .toString("base64");

const inlinePayloadScript = `<script>window.__VOOALTO_INLINE_OCR__={coreJsB64:"${coreJsB64}",porGzB64:"${porGzB64}"};</script>`;
html = html.replace("</head>", `${inlinePayloadScript}\n</head>`);

const targetHtml = path.join(repoRoot, "Abrir_Sistema_Vooalto.html");
fs.writeFileSync(targetHtml, html, "utf8");
fs.rmSync(tmpDir, { recursive: true, force: true });

const sizeMb = (fs.statSync(targetHtml).size / (1024 * 1024)).toFixed(2);
console.log(`✓ Standalone Abrir_Sistema_Vooalto.html generated (${sizeMb} MB)`);
