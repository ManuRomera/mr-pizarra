// Comprueba que el zip lleva lo importante: lo usan `npm run zip` (local) y la release (CI).
import { execFileSync } from "node:child_process";
const list = execFileSync("unzip", ["-Z1", "dist/mr-pizarra.zip"], { encoding: "utf8" }).split("\n").filter(Boolean);
const need = ["module.json", "scripts/main.mjs", "scripts/rules.mjs", "styles/mr-pizarra.css", "lang/es.json", "lang/en.json", "assets/manifest.json"];
const missing = need.filter((f) => !list.includes(f));
const images = list.filter((f) => f.startsWith("assets/") && f.endsWith(".webp")).length;
if (missing.length || images !== 113) {
  console.error("Zip incompleto:", { missing, images });
  process.exit(1);
}
console.log(`zip ok: ${list.length} archivos, ${images} imágenes`);
