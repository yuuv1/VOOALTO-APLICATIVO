import { register } from "node:module";

const hookSource = `
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith("?raw")) {
    const clean = specifier.slice(0, -4);
    const resolved = await nextResolve(clean, context);
    return { url: resolved.url + "?raw", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith("?raw")) {
    const filePath = fileURLToPath(url.slice(0, -4));
    const txt = fs.readFileSync(filePath, "utf8");
    return {
      format: "module",
      shortCircuit: true,
      source: "export default " + JSON.stringify(txt) + ";",
    };
  }
  return nextLoad(url, context);
}
`;

register("data:text/javascript;charset=utf-8," + encodeURIComponent(hookSource), import.meta.url);

const raf = (cb) => setTimeout(() => cb(Date.now()), 0);
const caf = (id) => clearTimeout(id);
globalThis.requestAnimationFrame = raf;
globalThis.cancelAnimationFrame = caf;
globalThis.window = {
  location: {
    protocol: "file:",
    href: "file:///Abrir_Sistema_Vooalto.html",
  },
  atob: (b64) => Buffer.from(b64, "base64").toString("binary"),
  requestAnimationFrame: raf,
  cancelAnimationFrame: caf,
};

