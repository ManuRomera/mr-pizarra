// Escribe docs/prompt-ia.md con el mismo prompt que ofrece la ventana de importación (para usarlo sin abrir Foundry).
import { writeFileSync } from "node:fs";
import { buildPrompt } from "../scripts/import.mjs";
writeFileSync(new URL("../docs/prompt-ia.md", import.meta.url), buildPrompt());
console.log("docs/prompt-ia.md listo");
