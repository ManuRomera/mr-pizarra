// Genera lang/es.json (y la base de lang/en.json si no existe) desde scripts/strings.mjs.
import { writeFileSync, existsSync } from "node:fs";
import { STR } from "../scripts/strings.mjs";
const es = Object.fromEntries(Object.entries(STR).map(([k, v]) => [`MRP.${k}`, v]));
writeFileSync(new URL("../lang/es.json", import.meta.url), `${JSON.stringify(es, null, 2)}\n`);
if (!existsSync(new URL("../lang/en.json", import.meta.url))) writeFileSync(new URL("../lang/en.json", import.meta.url), `${JSON.stringify(es, null, 2)}\n`);
console.log("lang listo:", Object.keys(es).length, "textos");
