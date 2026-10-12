import { ID, ASSETS } from "./rules.mjs";
import { STR } from "./strings.mjs";

/** Texto de la interfaz: lo que haya en lang/ para el idioma activo y, si no, el español de strings.mjs. */
export const t = (key) => {
  const full = `MRP.${key}`;
  return game.i18n?.has(full) ? game.i18n.localize(full) : (STR[key] ?? key);
};
export const esc = (text) => foundry.utils.escapeHTML(String(text ?? ""));
export const uid = () => foundry.utils.randomID(16);

/** Tamaños (y huecos de los marcos) de cada imagen; se carga una vez al iniciar. */
export let MANIFEST = {};
export async function loadManifest() {
  try {
    MANIFEST = await foundry.utils.fetchJsonWithTimeout(`${ASSETS}/manifest.json`);
  } catch (error) {
    console.warn(`${ID} | No se pudo leer el manifiesto de imágenes`, error);
  }
}
/** Alto / ancho de una imagen del catálogo. */
export const ratioOf = (folder, id) => {
  const m = MANIFEST[`${folder}/${id}`];
  return m ? m.h / m.w : 1;
};
export const holeOf = (frame) => MANIFEST[`fotos/${frame}`]?.hole ?? [10, 10, 25, 10];

export const levelOf = (doc) => {
  if (!doc) return "none";
  if (game.user.isGM || doc.testUserPermission(game.user, "OBSERVER")) return "full";
  return doc.testUserPermission(game.user, "LIMITED") ? "limited" : "none";
};

/** Texto plano de un fragmento HTML. */
export const plain = (html) => {
  const body = new DOMParser().parseFromString(String(html ?? ""), "text/html").body;
  return body.textContent.replace(/\s+/g, " ").trim();
};
