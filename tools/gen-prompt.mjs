// Escribe los prompts de docs/ (el mismo que ofrece la ventana de importación) para usarlos sin abrir Foundry.
import { writeFileSync } from "node:fs";
import { buildPrompt } from "../scripts/import.mjs";
writeFileSync(new URL("../docs/prompt-ia.md", import.meta.url), buildPrompt({ mode: "board" }));
writeFileSync(new URL("../docs/prompt-ia-caja.md", import.meta.url), buildPrompt({ mode: "box" }));
console.log("docs/prompt-ia.md y docs/prompt-ia-caja.md listos");
