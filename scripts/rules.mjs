/**
 * Reglas puras de MR- Pizarra (sin Foundry): catálogo de imágenes, validación y traducción de operaciones a un
 * `update` de JournalEntry, y generación determinista de la «apariencia» de cada pieza (giro, máscara de recorte,
 * chincheta) a partir de su id, para que cada recorte sea distinto y no cambie al recargar.
 *
 * Cada elemento y cada hilo se guarda bajo su propia clave (`flags.mr-pizarra.board.items.<id>`): dos personas que
 * mueven piezas distintas escriben en rutas distintas y nunca se pisan.
 */
export const ID = "mr-pizarra";
export const BOARD = Object.freeze({ maxItems: 250, maxLinks: 500, width: 3200, height: 2000, titleMax: 120, textMax: 4000, labelMax: 60, batch: 60 });
export const FLAG = `flags.${ID}.board`;
export const ASSETS = `modules/${ID}/assets`;
export const asset = (folder, name) => `${ASSETS}/${folder}/${name}.webp`;

const list = (folder, ids) => ids.map(([id, name, extra]) => ({ id, name, folder, ...extra }));

/** Fondos agrupados por ambientación. */
export const BACKGROUNDS = Object.freeze([
  ...list("fondos", [
    ["corcho-claro", "Corcho clásico", { group: "Clásicos", size: 620 }],
    ["corcho-noir", "Corcho noir", { group: "Clásicos", size: 620 }],
    ["carton-archivo-policial", "Archivo policial", { group: "Clásicos", size: 900 }],
    ["lienzo-yute", "Lienzo de yute", { group: "Clásicos", size: 560 }],
    ["pizarra-escolar-tiza", "Pizarra de tiza", { group: "Clásicos", size: 1000 }],
    ["plano-azul-blueprint", "Plano azul", { group: "Clásicos", size: 900 }],
    ["papel-victoriano-verde", "Salón victoriano", { group: "Época", size: 1000 }],
    ["empapelado-hotel-art-deco", "Hotel art déco", { group: "Época", size: 1100 }],
    ["papel-pintado-lovecraft", "Casa maldita", { group: "Época", size: 1000 }],
    ["pergamino-nautico", "Carta náutica", { group: "Época", size: 1024 }],
    ["piedra-medieval", "Muro medieval", { group: "Época", size: 1100 }],
    ["madera-oeste", "Tablones del Oeste", { group: "Época", size: 1200 }],
    ["papel-washi-oriental", "Papel washi", { group: "Época", size: 900 }],
    ["mesa-sala-de-guerra", "Sala de guerra", { group: "Moderno y futuro", size: 1100 }],
    ["moqueta-anos-80", "Oficina de los 80", { group: "Moderno y futuro", size: 600 }],
    ["ladrillo-industrial", "Ladrillo industrial", { group: "Moderno y futuro", size: 1100 }],
    ["hormigon-ciberpunk", "Hormigón ciberpunk", { group: "Moderno y futuro", size: 1000 }],
    ["panel-sci-fi", "Panel de nave", { group: "Moderno y futuro", size: 1000 }],
    ["cuero-steampunk", "Cuero steampunk", { group: "Moderno y futuro", size: 1100 }],
  ]),
]);

/** Papeles para los recortes; `style` decide la tipografía y la composición del texto. */
export const PAPERS = Object.freeze(
  list("recortes", [
    ["periodico-1", "Periódico blanco", { style: "periodico" }],
    ["periodico-2", "Periódico amarillento", { style: "periodico" }],
    ["periodico-3", "Periódico gris", { style: "periodico" }],
    ["periodico-4", "Periódico viejo", { style: "periodico" }],
    ["telegrama", "Telegrama", { style: "telegrama" }],
    ["ficha-mecanografiada", "Ficha mecanografiada", { style: "ficha" }],
    ["ficha-indice", "Ficha de archivo", { style: "ficha" }],
    ["etiqueta-prueba", "Etiqueta de prueba", { style: "ficha" }],
    ["libreta-cuadros", "Libreta de cuadros", { style: "manuscrito" }],
    ["libreta-rayas", "Libreta de rayas", { style: "manuscrito" }],
    ["cuaderno-arrancado", "Hoja de cuaderno", { style: "manuscrito" }],
    ["papel-viejo-1", "Papel viejo I", { style: "papel" }],
    ["papel-viejo-2", "Papel viejo II", { style: "papel" }],
    ["papel-viejo-3", "Papel viejo III", { style: "papel" }],
    ["papel-calco", "Papel de calco", { style: "papel" }],
    ["fotocopia", "Fotocopia", { style: "fotocopia" }],
    ["sobre-manila", "Sobre manila", { style: "sobre" }],
    ["sobre-carta", "Sobre de carta", { style: "sobre" }],
  ]),
);
/** Contornos que `auto` puede elegir: los que dejan un hueco amplio para el texto (medido en manifest.safe). */
export const AUTO_MASKS = Object.freeze(["rasgado-1", "rasgado-3", "rasgado-5", "rasgado-7", "tijera-1", "tijera-4", "quemado-2"]);
/** Contornos irregulares (máscaras). `auto` elige uno según el id de la pieza. */
export const MASKS = Object.freeze(
  list("bordes", [
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => [`rasgado-${n}`, `Rasgado ${n}`, { kind: "rasgado" }]),
    ...[1, 2, 3, 4].map((n) => [`tijera-${n}`, `Tijera ${n}`, { kind: "tijera" }]),
    ...[1, 2].map((n) => [`quemado-${n}`, `Quemado ${n}`, { kind: "quemado" }]),
  ]),
);
export const NOTE_COLORS = Object.freeze(["amarillo", "rosa", "verde", "azul"]);
export const FRAMES = Object.freeze(
  list("fotos", [
    ["polaroid", "Polaroid"],
    ["foto-borde-blanco", "Copia con borde dentado"],
    ["foto-sepia-esquinas", "Álbum antiguo"],
    ["foto-instantanea-80", "Instantánea de los 80"],
    ["diapositiva", "Diapositiva"],
    ["recorte-foto-dentado", "Foto de prensa"],
  ]),
);
/** Adornos que sujetan las piezas. */
export const PINS = Object.freeze(
  list("adornos", [
    ...["roja", "azul", "verde", "amarilla", "blanca"].map((c) => [`chincheta-${c}`, `Chincheta ${c}`, { kind: "chincheta" }]),
    ["clip-metal", "Clip metálico", { kind: "clip" }],
    ["clip-negro", "Clip negro", { kind: "clip" }],
    ...["rojo", "azul", "verde", "mostaza"].map((c) => [`cinta-washi-${c}`, `Cinta washi ${c}`, { kind: "cinta" }]),
    ["cinta-adhesiva-1", "Cinta adhesiva I", { kind: "cinta" }],
    ["cinta-adhesiva-2", "Cinta adhesiva II", { kind: "cinta" }],
    ["grapa", "Grapa", { kind: "grapa" }],
  ]),
);
/** Sellos con texto (el marco es imagen, el texto lo pinta el módulo). */
export const STAMPS = Object.freeze(
  list("sellos", [
    ["marco-rect-rojo", "Rectangular rojo", { ink: "#b8352c" }],
    ["marco-rect-azul", "Rectangular azul", { ink: "#3d5f96" }],
    ["marco-rect-negro", "Rectangular negro", { ink: "#3a342d" }],
    ["marco-doble-rect-rojo", "Rectangular doble rojo", { ink: "#b8352c" }],
    ["marco-circular-rojo", "Circular rojo", { ink: "#b8352c" }],
    ["marco-circular-azul", "Circular azul", { ink: "#3d5f96" }],
    ["marco-circular-negro", "Circular negro", { ink: "#3a342d" }],
    ["marco-oval-rojo", "Ovalado rojo", { ink: "#b8352c" }],
  ]),
);
/** Marcas sueltas: trazos de rotulador, huellas y manchas. */
export const MARKS = Object.freeze([
  ...list("sellos", [
    ...[1, 2, 3].map((n) => [`tachado-${n}`, `Tachado ${n}`, { group: "Rotulador" }]),
    ...[1, 2].map((n) => [`subrayado-rojo-${n}`, `Subrayado ${n}`, { group: "Rotulador" }]),
    ...[1, 2, 3].map((n) => [`flecha-${n}`, `Flecha ${n}`, { group: "Rotulador" }]),
    ...[1, 2, 3].map((n) => [`circulo-${n}`, `Círculo ${n}`, { group: "Rotulador" }]),
    ["aspa-roja", "Aspa", { group: "Rotulador" }],
    ...[1, 2, 3].map((n) => [`huella-${n}`, `Huella ${n}`, { group: "Huellas" }]),
  ]),
  ...list("manchas", [
    ...[1, 2, 3].map((n) => [`cafe-${n}`, `Café ${n}`, { group: "Manchas", multiply: true }]),
    ["te-1", "Té", { group: "Manchas", multiply: true }],
    ...[1, 2].map((n) => [`tinta-${n}`, `Tinta ${n}`, { group: "Manchas", multiply: true }]),
    ["grasa-1", "Grasa", { group: "Manchas", multiply: true }],
    ["quemadura-1", "Quemadura", { group: "Manchas", multiply: true }],
    ["humedad-1", "Humedad", { group: "Manchas", multiply: true }],
  ]),
]);
export const THREAD_COLORS = Object.freeze({ rojo: "#c0392b", azul: "#2c6fbb", verde: "#2f8f5b", ambar: "#d9a21b", violeta: "#7d4fb5", negro: "#2b2b2b" });
export const THREAD_STYLES = Object.freeze(["solido", "punteado", "discontinuo"]);
export const ITEM_TYPES = Object.freeze(["note", "clipping", "photo", "journal", "entity", "stamp", "mark"]);
/** Anchura por defecto de cada tipo (la altura sale de la proporción de la imagen). */
export const DEFAULT_WIDTH = Object.freeze({ note: 190, clipping: 280, photo: 230, journal: 270, entity: 210, stamp: 230, mark: 170 });

/**
 * Dónde se sujeta una pieza. `x`,`y` son fracciones de su ancho y alto (0 arriba/izquierda); `c` indica la esquina
 * (−1 izquierda, 1 derecha) para girar el celo en diagonal. Un celo, una chincheta o un clip siguen el borde rasgado.
 */
export const PIN_LAYOUTS = Object.freeze({
  top: { name: "Centro arriba", pins: [{ x: 0.5, y: 0 }] },
  topCorners: { name: "Dos esquinas de arriba", pins: [{ x: 0.1, y: 0, c: -1 }, { x: 0.9, y: 0, c: 1 }] },
  fourCorners: { name: "Cuatro esquinas", pins: [{ x: 0.1, y: 0, c: -1 }, { x: 0.9, y: 0, c: 1 }, { x: 0.1, y: 1, c: 1 }, { x: 0.9, y: 1, c: -1 }] },
  topLeft: { name: "Esquina izquierda", pins: [{ x: 0.1, y: 0, c: -1 }] },
  topRight: { name: "Esquina derecha", pins: [{ x: 0.9, y: 0, c: 1 }] },
  bottom: { name: "Centro abajo", pins: [{ x: 0.5, y: 1 }] },
  topBottom: { name: "Arriba y abajo", pins: [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }] },
  sides: { name: "Laterales", pins: [{ x: 0, y: 0.5, s: -1 }, { x: 1, y: 0.5, s: 1 }] },
});
export const LAYOUT_IDS = Object.freeze(Object.keys(PIN_LAYOUTS));
/** Colocación por tipo cuando está en «auto». */
const AUTO_LAYOUT = Object.freeze({ note: "top", clipping: "top", photo: "topCorners", journal: "top", entity: "topCorners" });
/** Sujeción por defecto de una pizarra nueva. */
export const DEFAULT_PIN_PRESET = Object.freeze({ pin: "auto", color: "", layout: "auto" });
const HEX = /^#[0-9a-fA-F]{6}$/;

const byId = (table) => new Map(table.map((entry) => [entry.id, entry]));
export const TABLES = Object.freeze({ paper: byId(PAPERS), mask: byId(MASKS), frame: byId(FRAMES), pin: byId(PINS), stamp: byId(STAMPS), mark: byId(MARKS), background: byId(BACKGROUNDS) });

/* ---------------------------------- Apariencia determinista ---------------------------------- */

export function hash(text) {
  let h = 2166136261;
  for (const c of String(text)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}
/** Generador pseudoaleatorio con semilla (mulberry32): mismo id, misma serie. */
export function rng(seed) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (random, arr) => arr[Math.floor(random() * arr.length)];
const AUTO_PINS = Object.freeze({
  note: ["chincheta-roja", "chincheta-azul", "chincheta-verde", "chincheta-amarilla", "grapa"],
  clipping: ["cinta-washi-rojo", "cinta-washi-azul", "cinta-washi-verde", "cinta-washi-mostaza", "cinta-adhesiva-1", "cinta-adhesiva-2", "clip-metal"],
  photo: ["chincheta-roja", "cinta-adhesiva-1", "cinta-adhesiva-2", "clip-negro"],
  journal: ["clip-metal", "clip-negro", "cinta-adhesiva-1", "chincheta-roja"],
  entity: ["chincheta-roja", "chincheta-azul"],
});

/**
 * Giro, contorno y sujeciones de una pieza, resueltos desde su id cuando están en «auto» y desde la sujeción por defecto
 * de la pizarra (`preset`). Devuelve `pins`: una entrada por adorno con su posición relativa (x,y), giro y color.
 */
export function look(id, item, preset = DEFAULT_PIN_PRESET) {
  const random = rng(`${id}:${item.type}`);
  const jitter = (n) => Math.round((random() * 2 - 1) * n);
  const rot = Number.isFinite(item.rot) ? item.rot : Math.round((random() * 2 - 1) * 5 * 10) / 10;
  let mask = item.mask ?? "auto";
  if (mask === "auto") mask = ["clipping", "journal"].includes(item.type) ? pick(random, MASKS.filter((m) => AUTO_MASKS.includes(m.id))).id : "none";
  const skew = jitter(12) / 10;
  let pin = item.pin ?? "auto";
  if (pin === "auto") pin = preset.pin && preset.pin !== "auto" ? preset.pin : AUTO_PINS[item.type] ? pick(random, AUTO_PINS[item.type]) : "none";
  let layoutId = item.pinLayout ?? "auto";
  if (layoutId === "auto") layoutId = preset.layout && preset.layout !== "auto" ? preset.layout : (AUTO_LAYOUT[item.type] ?? "top");
  const layout = PIN_LAYOUTS[layoutId] ?? PIN_LAYOUTS.top;
  let color = item.pinColor ?? "";
  if (color === "") color = preset.color ?? "";
  const kind = TABLES.pin.get(pin)?.kind;
  const pins = kind
    ? layout.pins.map((spot, i) => {
        const r = rng(`${id}:pin${i}`);
        const j = (n) => Math.round((r() * 2 - 1) * n);
        const base = kind === "cinta" ? (spot.c ? spot.c * (38 + Math.abs(j(8))) : spot.s ? 90 + j(10) : j(10)) : j(kind === "chincheta" ? 8 : 12);
        return { pin, x: spot.x, y: spot.y, rot: base, dx: spot.c || spot.s ? 0 : j(14), c: spot.c ?? 0, s: spot.s ?? 0 };
      })
    : [];
  return { rot, mask, skew, pins, color: color === "orig" ? "" : color, layout: layoutId };
}

/* ---------------------------------- Validación ---------------------------------- */

const OBJECT_ID = /^[A-Za-z0-9]{8,24}$/;
const UUID = /^(JournalEntry|Actor|Scene|Item|RollTable)\.[A-Za-z0-9]{16}(?:\.JournalEntryPage\.[A-Za-z0-9]{16})?$/;
const IMAGE = /^(?:https?:\/\/[^\s"'<>]+|[\w%@+\-. /()]+)\.(?:png|jpe?g|webp|gif|avif|svg)(?:\?[^\s"'<>]*)?$/i;
const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value))));
const clean = (value, max) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
const oneOf = (value, table, what) => {
  if (!table.has(value)) throw Error(`${what} desconocido.`);
  return value;
};
const requireId = (id) => {
  if (!OBJECT_ID.test(String(id))) throw Error("Identificador de pizarra inválido.");
  return String(id);
};

const ratio = (v) => Math.round(Math.min(2.2, Math.max(0.25, Number(v))) * 100) / 100;
const AUTO = (table) => (value, what) => (value === "auto" ? value : oneOf(value, table, what));
const LAYOUT = (v) => (v === "auto" || PIN_LAYOUTS[v] ? v : (() => { throw Error("Colocación desconocida."); })());
const PINCOLOR = (v) => (v === "" || v === "orig" || HEX.test(v) ? v : (() => { throw Error("Color de sujeción no válido."); })());
const NONE = (table) => (value, what) => (value === "none" || value === "auto" ? value : oneOf(value, table, what));
/** Campos propios de cada tipo → validador. */
const FIELDS = {
  note: { pinLayout: LAYOUT, pinColor: PINCOLOR, text: (v) => clean(v, BOARD.textMax), color: (v) => (NOTE_COLORS.includes(v) ? v : (() => { throw Error("Color de nota desconocido."); })()), pin: NONE(TABLES.pin) },
  clipping: { pinLayout: LAYOUT, pinColor: PINCOLOR, ratio, title: (v) => clean(v, BOARD.titleMax), text: (v) => clean(v, BOARD.textMax), paper: (v) => oneOf(v, TABLES.paper, "Papel"), mask: NONE(TABLES.mask), pin: NONE(TABLES.pin) },
  photo: {
    pinLayout: LAYOUT,
    pinColor: PINCOLOR,
    src: (v) => {
      if (v === "") return ""; // foto sin imagen todavía
      if (!IMAGE.test(String(v)) || String(v).includes("..")) throw Error("Imagen no permitida.");
      return String(v);
    },
    text: (v) => clean(v, BOARD.labelMax * 2),
    frame: (v) => oneOf(v, TABLES.frame, "Marco"),
    pin: NONE(TABLES.pin),
  },
  journal: { pinLayout: LAYOUT, pinColor: PINCOLOR, ratio, pin: NONE(TABLES.pin), mask: NONE(TABLES.mask) },
  entity: { pinLayout: LAYOUT, pinColor: PINCOLOR, pin: NONE(TABLES.pin), frame: (v) => oneOf(v, TABLES.frame, "Marco") },
  stamp: { kind: (v) => oneOf(v, TABLES.stamp, "Sello"), text: (v) => clean(v, BOARD.labelMax) },
  mark: { kind: (v) => oneOf(v, TABLES.mark, "Marca") },
};
const COMMON = {
  x: (v) => clamp(v, 0, BOARD.width - 40),
  y: (v) => clamp(v, 0, BOARD.height - 40),
  z: (v) => clamp(v, 0, 99999),
  rot: (v) => clamp(v, -180, 180),
  w: (v) => clamp(v, 60, 1100),
};

function cleanItem(data, existing, ctx) {
  const out = {};
  for (const key of Object.keys(data)) {
    if (["type", "uuid"].includes(key)) continue;
    if (key === "hidden") {
      if (!ctx.isGM) throw Error("Solo la Guardiana puede ocultar piezas.");
      out.hidden = Boolean(data.hidden);
    } else if (key === "owner") {
      if (data.owner && !ctx.isGM && data.owner !== ctx.userId) throw Error("Una pieza privada solo puede ser tuya.");
      out.owner = data.owner ? clean(data.owner, 24) : "";
    } else if (COMMON[key]) out[key] = COMMON[key](data[key]);
    else if (FIELDS[existing.type]?.[key]) out[key] = FIELDS[existing.type][key](data[key], key);
    else throw Error(`Campo «${key}» no permitido en ${existing.type}.`);
  }
  return out;
}

const forbidden = (item, ctx) => (item.hidden && !ctx.isGM) || (item.owner && !ctx.isGM && item.owner !== ctx.userId);

/**
 * @param {{items?:object, links?:object, background?:string}} board  estado actual
 * @param {object[]} ops  {op:"set"|"remove", kind:"items"|"links"|"settings", id, data?}
 * @param {{isGM:boolean, userId:string}} ctx  quién envía las operaciones
 * @returns {{ops:object[], update:object, board:object}}  operaciones limpias, `update` equivalente y estado resultante
 */
export function planOps(board, ops, ctx) {
  const work = { background: board?.background, locked: Boolean(board?.locked), items: structuredClone(board?.items ?? {}), links: structuredClone(board?.links ?? {}) };
  const out = [];
  const update = {};
  const dropLink = (id) => {
    delete work.links[id];
    update[`${FLAG}.links.-=${id}`] = null;
    out.push({ op: "remove", kind: "links", id });
  };
  if (!Array.isArray(ops) || ops.length > BOARD.batch) throw Error("Lote de operaciones inválido.");
  if (work.locked && !ctx.isGM) throw Error("La Guardiana ha bloqueado la pizarra.");
  for (const raw of ops) {
    const id = requireId(raw?.id);
    if (raw.kind === "items" && raw.op === "set") {
      const data = raw.data ?? {};
      const existing = work.items[id];
      if (existing) {
        if (forbidden(existing, ctx)) throw Error("No puedes tocar esa pieza.");
        const fields = cleanItem(data, existing, ctx);
        Object.assign(existing, fields);
        for (const [key, value] of Object.entries(fields)) update[`${FLAG}.items.${id}.${key}`] = value;
        out.push({ op: "set", kind: "items", id, data: fields });
        continue;
      }
      if (!ITEM_TYPES.includes(data.type)) throw Error("Tipo de pieza desconocido.");
      if (Object.keys(work.items).length >= BOARD.maxItems) throw Error("La pizarra está llena.");
      const item = { type: data.type, x: 0, y: 0, z: 1 };
      if (["journal", "entity"].includes(data.type)) {
        const match = UUID.exec(String(data.uuid));
        const isJournal = match?.[1] === "JournalEntry";
        if (!match || isJournal !== (data.type === "journal")) throw Error("Ese documento no se puede colgar aquí.");
        item.uuid = String(data.uuid);
      }
      if (data.type === "note") Object.assign(item, { text: "", color: "amarillo" });
      if (data.type === "clipping") Object.assign(item, { title: "", text: "", paper: "periodico-1" });
      if (data.type === "photo") {
        if (!("src" in data)) throw Error("Una foto necesita su imagen.");
        Object.assign(item, { src: "", text: "", frame: "polaroid" });
      }
      if (data.type === "stamp") Object.assign(item, { kind: "marco-rect-rojo", text: "" });
      if (data.type === "mark") Object.assign(item, { kind: "tachado-1" });
      if (data.type === "entity") item.frame = "polaroid";
      if (!ctx.isGM && "hidden" in data) throw Error("Solo la Guardiana puede ocultar piezas.");
      Object.assign(item, cleanItem(data, item, ctx));
      work.items[id] = item;
      for (const [key, value] of Object.entries(item)) update[`${FLAG}.items.${id}.${key}`] = value;
      out.push({ op: "set", kind: "items", id, data: { ...item } });
    } else if (raw.kind === "items" && raw.op === "remove") {
      const existing = work.items[id];
      if (!existing) continue;
      if (forbidden(existing, ctx)) throw Error("No puedes quitar esa pieza.");
      delete work.items[id];
      update[`${FLAG}.items.-=${id}`] = null;
      out.push({ op: "remove", kind: "items", id });
      for (const [linkId, link] of Object.entries(work.links)) if (link.from === id || link.to === id) dropLink(linkId);
    } else if (raw.kind === "links" && raw.op === "set") {
      const data = raw.data ?? {};
      const fields = {};
      if ("color" in data) fields.color = Object.hasOwn(THREAD_COLORS, data.color) ? data.color : (() => { throw Error("Color de hilo desconocido."); })();
      if ("style" in data) fields.style = THREAD_STYLES.includes(data.style) ? data.style : (() => { throw Error("Estilo de hilo desconocido."); })();
      if ("label" in data) fields.label = clean(data.label, BOARD.labelMax);
      const existing = work.links[id];
      if (existing) {
        Object.assign(existing, fields);
        for (const [key, value] of Object.entries(fields)) update[`${FLAG}.links.${id}.${key}`] = value;
        out.push({ op: "set", kind: "links", id, data: fields });
        continue;
      }
      const { from, to } = data;
      if (!work.items[from] || !work.items[to] || from === to) throw Error("Un hilo une dos piezas distintas de la pizarra.");
      if (forbidden(work.items[from], ctx) || forbidden(work.items[to], ctx)) throw Error("No puedes unir esa pieza.");
      if (Object.keys(work.links).length >= BOARD.maxLinks) throw Error("Hay demasiados hilos.");
      const link = { from, to, color: "rojo", style: "solido", label: "", ...fields };
      const twin = Object.values(work.links).some((l) => l.color === link.color && l.style === link.style && [l.from, l.to].sort().join() === [from, to].sort().join());
      if (twin) continue;
      work.links[id] = link;
      for (const [key, value] of Object.entries(link)) update[`${FLAG}.links.${id}.${key}`] = value;
      out.push({ op: "set", kind: "links", id, data: link });
    } else if (raw.kind === "links" && raw.op === "remove") {
      const link = work.links[id];
      if (link && (forbidden(work.items[link.from] ?? {}, ctx) || forbidden(work.items[link.to] ?? {}, ctx))) throw Error("No puedes quitar ese hilo.");
      if (link) dropLink(id);
    } else if (raw.kind === "settings" && raw.op === "set") {
      const data = {};
      if ("background" in (raw.data ?? {})) data.background = oneOf(raw.data.background, TABLES.background, "Fondo");
      if ("locked" in (raw.data ?? {})) {
        if (!ctx.isGM) throw Error("Solo la Guardiana puede bloquear la pizarra.");
        data.locked = Boolean(raw.data.locked);
      }
      if ("pinPreset" in (raw.data ?? {})) {
        const p = raw.data.pinPreset ?? {};
        data.pinPreset = {
          pin: p.pin === "auto" || p.pin === "none" ? p.pin : oneOf(p.pin, TABLES.pin, "Sujeción"),
          color: p.color === "" ? "" : PINCOLOR(p.color),
          layout: LAYOUT(p.layout),
        };
      }
      Object.assign(work, data);
      for (const [key, value] of Object.entries(data)) update[`${FLAG}.${key}`] = value;
      out.push({ op: "set", kind: "settings", id, data });
    } else throw Error("Operación de pizarra desconocida.");
  }
  return { ops: out, update, board: work };
}
