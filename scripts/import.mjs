/**
 * Importación de pizarras compuestas por una IA (sin Foundry: se puede probar en Node).
 *  - `buildPrompt()` genera el prompt que se le da a la IA junto con la aventura; sale del propio catálogo de rules.mjs.
 *  - `parseImport()` saca el JSON de la respuesta (con o sin vallas de código o texto alrededor).
 *  - `normalizeImport()` valida y normaliza: cada problema es un aviso con su lugar y su motivo; lo que no vale se omite y el resto se importa.
 */
import { BOARD, LAYER_COLORS, BACKGROUNDS, PAPERS, MASKS, FRAMES, STAMPS, MARKS, PINS, PIN_LAYOUTS, NOTE_COLORS, THREAD_COLORS, THREAD_STYLES, TABLES, DEFAULT_WIDTH } from "./rules.mjs";

export const IMPORT_FORMAT = "mr-pizarra-import";
export const IMPORT_VERSION = 1;
const TYPES = ["note", "clipping", "photo", "stamp", "mark", "entity", "journal"];
const KINDS = ["Actor", "Scene", "Item", "RollTable"];
const IMAGE = /^(?:https?:\/\/[^\s"'<>]+|[\w%@+\-. /()]+)\.(?:png|jpe?g|webp|gif|avif|svg)(?:\?[^\s"'<>]*)?$/i;
const HEX = /^#[0-9a-fA-F]{6}$/;
const num = (v) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const text = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);

/** Saca el objeto JSON de la respuesta de la IA aunque venga con texto delante, detrás o dentro de una valla ```json. */
export function parseImport(raw) {
  const source = String(raw ?? "").trim();
  if (!source) throw Error("No hay nada que importar: pega la respuesta de la IA.");
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(source);
  const candidate = fenced ? fenced[1] : source;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw Error("No encuentro un objeto JSON en el texto pegado.");
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (error) {
    throw Error(`El JSON no es válido (${error.message}). Pide a la IA que lo corrija y devuelva solo el JSON.`);
  }
}

/**
 * @returns {{title:string, mode:'board'|'box', background:string|null, pinPreset:object|null, layers:object[], items:object[], links:object[], issues:object[], stats:object}}
 *  `items[i]` = {ref, type, data, layerRef?, journalText?, showToAll?}; `data` está listo para `planOps` (sin ids, uuid ni capa).
 *  `mode`: «board» (pizarra montada, con posiciones e hilos) o «box» (las piezas van a la caja, sin estructura).
 */
export function normalizeImport(input) {
  const issues = [];
  const warn = (where, message) => issues.push({ level: "aviso", where, message });
  const fail = (where, message) => issues.push({ level: "error", where, message });
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("raíz", "El JSON debe ser un objeto con «items» y «links».");
    return { title: "", mode: "board", background: null, pinPreset: null, layers: [], items: [], links: [], issues, stats: {} };
  }
  if (input.format !== IMPORT_FORMAT) warn("raíz", `Falta «format»: "${IMPORT_FORMAT}"; se importa igualmente.`);
  const mode = input.mode === "box" ? "box" : "board";
  if (input.mode !== undefined && !["board", "box"].includes(input.mode)) warn("mode", `«mode» debe ser "board" o "box"; se usa "board".`);
  // capas de revelación
  const layers = [];
  const layerRefs = new Set();
  (Array.isArray(input.layers) ? input.layers : []).slice(0, BOARD.maxLayers).forEach((raw, i) => {
    const where = `layers[${i}]`;
    const name = text(raw?.name, 40).trim();
    const ref = text(raw?.ref, 60).trim();
    if (!ref || !name) return fail(where, "Una capa necesita «ref» y «name».");
    if (layerRefs.has(ref)) return warn(where, `La capa «${ref}» está repetida; se ignora.`);
    layerRefs.add(ref);
    layers.push({ ref, name, color: HEX.test(String(raw.color)) ? raw.color : LAYER_COLORS[i % LAYER_COLORS.length], revealed: Boolean(raw.revealed) });
  });
  if (Array.isArray(input.layers) && input.layers.length > BOARD.maxLayers) warn("layers", `Hay ${input.layers.length} capas; el máximo es ${BOARD.maxLayers}.`);
  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (!Array.isArray(input.items)) fail("items", "«items» debe ser una lista.");
  if (rawItems.length > BOARD.maxItems) warn("items", `Hay ${rawItems.length} piezas; el máximo es ${BOARD.maxItems} y se importan las primeras.`);

  const items = [];
  const refs = new Map();
  rawItems.slice(0, BOARD.maxItems).forEach((raw, i) => {
    const where = `items[${i}]${raw?.ref ? ` (${raw.ref})` : ""}`;
    if (!raw || typeof raw !== "object") return fail(where, "No es un objeto.");
    const type = String(raw.type ?? "");
    if (!TYPES.includes(type)) return fail(where, `Tipo «${type}» desconocido. Válidos: ${TYPES.join(", ")}.`);
    let ref = text(raw.ref, 60).trim() || `p${i + 1}`;
    if (refs.has(ref)) {
      warn(where, `La referencia «${ref}» está repetida; se renombra.`);
      ref = `${ref}-${i + 1}`;
    }
    const data = { type };
    const keepEnum = (key, table, fallback, label) => {
      if (raw[key] === undefined) return fallback !== undefined && (data[key] = fallback);
      if (table.has(raw[key])) data[key] = raw[key];
      else {
        warn(where, `${label} «${raw[key]}» no existe; se usa «${fallback}».`);
        if (fallback !== undefined) data[key] = fallback;
      }
    };
    let journalText;
    if (type === "note") {
      data.text = text(raw.text, BOARD.textMax);
      data.color = NOTE_COLORS.includes(raw.color) ? raw.color : "amarillo";
      if (raw.color !== undefined && !NOTE_COLORS.includes(raw.color)) warn(where, `Color de nota «${raw.color}» no existe; se usa amarillo.`);
    } else if (type === "clipping") {
      data.title = text(raw.title, BOARD.titleMax);
      data.text = text(raw.text, BOARD.textMax);
      keepEnum("paper", TABLES.paper, "periodico-1", "Papel");
      if (raw.mask !== undefined && (raw.mask === "auto" || raw.mask === "none" || TABLES.mask.has(raw.mask))) data.mask = raw.mask;
      const ratio = num(raw.ratio);
      if (ratio !== null) data.ratio = clamp(ratio, 0.25, 2.2);
    } else if (type === "photo") {
      data.frame = TABLES.frame.has(raw.frame) ? raw.frame : "polaroid";
      data.text = text(raw.text, BOARD.labelMax * 2);
      data.src = typeof raw.src === "string" && IMAGE.test(raw.src) && !raw.src.includes("..") ? raw.src : "";
      if (raw.src && !data.src) warn(where, "La imagen no es una ruta o URL de imagen válida; la foto queda sin imagen para elegirla después.");
    } else if (type === "stamp") {
      keepEnum("kind", TABLES.stamp, "marco-rect-rojo", "Sello");
      data.text = text(raw.text, BOARD.labelMax);
    } else if (type === "mark") {
      keepEnum("kind", TABLES.mark, "tachado-1", "Marca");
    } else if (type === "entity") {
      data.name = text(raw.name, 120).trim();
      if (!data.name) return fail(where, "Una ficha necesita «name» (el nombre exacto del personaje, lugar u objeto).");
      data.kind = KINDS.includes(raw.kind) ? raw.kind : "";
      if (raw.kind !== undefined && !KINDS.includes(raw.kind)) warn(where, `«kind» debe ser ${KINDS.join(", ")}; queda sin tipo.`);
      data.frame = TABLES.frame.has(raw.frame) ? raw.frame : "polaroid";
      if (raw.img && IMAGE.test(String(raw.img)) && !String(raw.img).includes("..")) data.img = String(raw.img);
    } else if (type === "journal") {
      const title = text(raw.title, BOARD.titleMax).trim();
      if (!title) return fail(where, "Un documento necesita «title».");
      journalText = text(raw.text, 20000);
      data.title = title; // se usa para crear el diario; si no se crea, se convierte en recorte
      if (raw.ratio !== undefined && num(raw.ratio) !== null) data.ratio = clamp(num(raw.ratio), 0.25, 2.2);
    }
    // campos comunes
    const w = num(raw.w);
    if (w !== null && !["mark"].includes(type)) data.w = clamp(Math.round(w), 60, 1100);
    else if (w !== null) data.w = clamp(Math.round(w), 60, 1100);
    const rot = num(raw.rot);
    if (rot !== null) data.rot = clamp(Math.round(rot), -20, 20);
    const x = num(raw.x);
    const y = num(raw.y);
    if (x !== null) data.x = clamp(Math.round(x), 0, BOARD.width - 40);
    if (y !== null) data.y = clamp(Math.round(y), 0, BOARD.height - 40);
    if (raw.hidden !== undefined) data.hidden = Boolean(raw.hidden);
    const group = text(raw.group, 30).trim();
    if (group) data.group = group;
    let layerRef;
    if (raw.layer !== undefined && raw.layer !== "") (layerRefs.has(raw.layer) ? (layerRef = raw.layer) : warn(where, `La capa «${raw.layer}» no está definida en «layers»; la pieza queda sin capa.`));
    if (["note", "clipping", "photo", "journal", "entity"].includes(type)) {
      if (raw.pin !== undefined) (raw.pin === "auto" || raw.pin === "none" || TABLES.pin.has(raw.pin) ? (data.pin = raw.pin) : warn(where, `Sujeción «${raw.pin}» no existe; se usa la de la pizarra.`));
      if (raw.pinLayout !== undefined) (raw.pinLayout === "auto" || PIN_LAYOUTS[raw.pinLayout] ? (data.pinLayout = raw.pinLayout) : warn(where, `Colocación «${raw.pinLayout}» no existe; se usa la de la pizarra.`));
      if (raw.pinColor !== undefined) (raw.pinColor === "" || raw.pinColor === "orig" || HEX.test(String(raw.pinColor)) ? (data.pinColor = raw.pinColor) : warn(where, `Color de sujeción «${raw.pinColor}» no es #rrggbb; se ignora.`));
    }
    refs.set(ref, items.length);
    items.push({ ref, type, data, layerRef, journalText, showToAll: type === "entity" && Boolean(raw.showToAll) });
  });

  // colocar solo lo que no traiga posición: una cuadrícula ordenada para que se pueda recolocar a mano
  let slot = 0;
  for (const it of items) {
    if (mode === "box" || (it.data.x !== undefined && it.data.y !== undefined)) continue;
    const w = it.data.w ?? DEFAULT_WIDTH[it.type] ?? 200;
    const col = slot % 8;
    const row = Math.floor(slot / 8);
    it.data.x ??= clamp(150 + col * 380, 0, BOARD.width - w - 40);
    it.data.y ??= clamp(150 + row * 420, 0, BOARD.height - 300);
    slot++;
    warn(`${it.ref}`, "No traía posición: se colocó en la cuadrícula inicial.");
  }

  const links = [];
  const seen = new Set();
  if (mode === "box" && Array.isArray(input.links) && input.links.length) warn("links", "En modo caja no hay hilos: se ignoran.");
  (mode === "box" ? [] : Array.isArray(input.links) ? input.links : []).slice(0, BOARD.maxLinks).forEach((raw, i) => {
    const where = `links[${i}]`;
    if (!raw || typeof raw !== "object") return fail(where, "No es un objeto.");
    if (!refs.has(raw.from) || !refs.has(raw.to)) return fail(where, `Referencia desconocida (${raw.from} → ${raw.to}): el hilo se omite.`);
    if (raw.from === raw.to) return fail(where, "Un hilo une dos piezas distintas.");
    const color = Object.hasOwn(THREAD_COLORS, raw.color) ? raw.color : "rojo";
    const style = THREAD_STYLES.includes(raw.style) ? raw.style : "solido";
    if (raw.color !== undefined && color !== raw.color) warn(where, `Color de hilo «${raw.color}» no existe; se usa rojo.`);
    if (raw.style !== undefined && style !== raw.style) warn(where, `Estilo de hilo «${raw.style}» no existe; se usa continuo.`);
    const key = `${[raw.from, raw.to].sort().join("|")}|${color}|${style}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ from: raw.from, to: raw.to, color, style, label: text(raw.label, BOARD.labelMax) });
  });

  let pinPreset = null;
  if (input.pinPreset && typeof input.pinPreset === "object") {
    const p = input.pinPreset;
    pinPreset = {
      pin: p.pin === "auto" || p.pin === "none" || TABLES.pin.has(p.pin) ? p.pin : "auto",
      color: p.color === "" || HEX.test(String(p.color)) ? p.color : "",
      layout: p.layout === "auto" || PIN_LAYOUTS[p.layout] ? p.layout : "auto",
    };
  }
  const background = TABLES.background.has(input.background) ? input.background : null;
  if (input.background && !background) warn("background", `Fondo «${input.background}» no existe; se mantiene el actual.`);

  const stats = {
    items: items.length,
    links: links.length,
    hidden: items.filter((i) => i.data.hidden).length,
    layers: layers.length,
    groups: [...new Set(items.map((i) => i.data.group).filter(Boolean))],
    pending: items.filter((i) => i.type === "entity").length,
    documents: items.filter((i) => i.type === "journal").length,
    byType: Object.fromEntries(TYPES.map((t) => [t, items.filter((i) => i.type === t).length]).filter(([, n]) => n)),
  };
  return { title: text(input.title, 120), mode, background, pinPreset, layers, items, links, issues, stats };
}

/* ---------------------------------- Prompt para la IA ---------------------------------- */

const list = (entries, fmt) => entries.map(fmt).join("\n");

/** Catálogo de ids válidos, generado desde rules.mjs (se mantiene solo). */
function catalog() {
  return `### Listas de ids válidos
**A · papeles (clipping.paper)**
${list(PAPERS, (p) => `  - "${p.id}" · ${p.name} · estilo ${p.style}`)}

**B · marcos (photo.frame, entity.frame)**
${list(FRAMES, (f) => `  - "${f.id}" · ${f.name}`)}

**C · sellos (stamp.kind)**
${list(STAMPS, (x) => `  - "${x.id}" · ${x.name}`)}

**D · marcas (mark.kind)**
${list(MARKS, (m) => `  - "${m.id}" · ${m.name} (${m.group})`)}

**E · sujeciones (pin)**
${list(PINS, (x) => `  - "${x.id}" · ${x.name}`)}

**F · colocaciones (pinLayout)**
${list(Object.entries(PIN_LAYOUTS), ([k, l]) => `  - "${k}" · ${l.name}`)}

**Fondos (background)** — elige el que mejor case con la ambientación de la aventura:
${list(BACKGROUNDS, (b) => `  - "${b.id}" · ${b.name} (${b.group})`)}

Colores de hilo: ${Object.keys(THREAD_COLORS).map((c) => `"${c}"`).join(", ")}. Estilos de hilo: ${THREAD_STYLES.map((x) => `"${x}"`).join(", ")}.`;
}

const PIECES_TABLE = (masks) => `| type | campos propios |
|---|---|
| \`note\` | \`text\` (≤ 300 caracteres), \`color\`: ${NOTE_COLORS.map((c) => `"${c}"`).join(", ")} |
| \`clipping\` | \`title\` (≤ ${BOARD.titleMax}), \`text\` (≤ 900 recomendado), \`paper\` (lista A), \`ratio\` (alto/ancho 0,25–2,2; opcional), \`mask\`: "auto" o uno de ${masks} (normalmente omítelo) |
| \`photo\` | \`frame\` (lista B), \`text\` (pie de foto), \`src\` (déjalo vacío: \`""\`) |
| \`stamp\` | \`kind\` (lista C), \`text\` (≤ 25 caracteres, en mayúsculas) |
| \`mark\` | \`kind\` (lista D) |
| \`entity\` | \`name\` (**obligatorio**, nombre exacto), \`kind\`: "Actor", "Scene", "Item" o "RollTable", \`frame\` (lista B), \`showToAll\` (opcional) |
| \`journal\` | \`title\` (**obligatorio**), \`text\` (el texto completo del documento; separa los párrafos con una línea en blanco) |`;

const EXTRACT = `## 1. Qué extraer de la aventura
Lee la aventura y extrae, sin inventar nada que no esté en ella (si algo es ambiguo, anótalo con cautela en el texto de la pieza):
1. **Personas**: víctima(s), sospechosos, testigos, aliados, antagonistas, PNJ clave. Una persona = una pieza \`entity\` con \`kind: "Actor"\`.
2. **Lugares**: escenas importantes. Una pieza \`entity\` con \`kind: "Scene"\`, o una \`photo\` si el lugar es solo una referencia visual.
3. **Objetos y pruebas** físicas: \`entity\` con \`kind: "Item"\` si son objetos con ficha propia, o \`note\`/\`clipping\` si es solo una anotación.
4. **Pistas**: cada pista con qué revela y dónde se encuentra.
5. **Documentos** que existen en la aventura (cartas, informes, diarios, recortes de prensa, telegramas): piezas \`journal\` (se crea el documento con su texto completo) o \`clipping\` (el texto aparece directamente en un recorte).
6. **Hechos y cronología**: qué pasó y cuándo; notas o recortes cortos.
7. **Hipótesis, coartadas, contradicciones y secretos**.`;

const REPRESENT = `## 2. Cómo elegir la representación de cada cosa
- **Persona o lugar con ficha propia** → \`entity\` (foto con marco y su nombre). Usa el **nombre exacto** de la aventura: el módulo lo usa para vincularlo con el actor o la escena del mundo si ya existen; si no existen, la pieza queda «sin vincular» y el master la vincula después.
- **Pista breve** → \`note\` (una frase). Pista con más contexto → \`clipping\`.
- **Noticia, telegrama, ficha policial, carta corta** → \`clipping\` con el \`paper\` que mejor encaje (periódico para prensa, telegrama para telegramas, ficha para informes, libreta para anotaciones, papel viejo para cartas).
- **Documento largo o que el master quiera dar a leer a los jugadores** → \`journal\` (título y texto completos; se crea como diario y los jugadores solo lo leen cuando el master les da permiso).
- **Lugar o escena visual sin ficha** → \`photo\` (pie de foto = nombre del lugar; deja \`src\` vacío, la imagen se elige después).
- **Estado o calificación** (URGENTE, CONFIDENCIAL, RESUELTO, SOSPECHOSO…) → \`stamp\` junto a la pieza que califica.
- **Énfasis** (rodear, tachar, subrayar, flecha, huella) → \`mark\`. Úsalas con medida.
- Variedad: alterna papeles, marcos y sellos para que no parezca una plantilla, pero con lógica (p. ej. sospechosos con \`polaroid\`, víctimas con \`foto-sepia-esquinas\`, pruebas con \`diapositiva\`).`;

const LAYERS = (mode) => `## 3. Capas de revelación (para no abrumar a los jugadores)
En vez de mostrarlo todo de golpe, divide la información en **entre 3 y 6 capas** que el master irá revelando según avance la partida (por actos, capítulos o niveles de conocimiento). Defínelas en \`layers\` y asigna cada pieza a una con \`layer\`:
- Capa 1: lo que los jugadores saben al empezar → \`"revealed": true\`. Las demás → \`"revealed": false\`.
- Ordena las capas de menor a mayor profundidad (planteamiento → desarrollo → giros → verdad final). Pon nombres cortos y claros («Planteamiento», «Los sospechosos», «El giro»).
- Cada pieza va en **una** capa. Una pieza que no pongas en ninguna capa será visible desde el principio.
- \`hidden: true\` es para un secreto concreto dentro de una capa ya revelada (se muestra con un clic del master). Normalmente **no lo uses** si ya usas capas.
- \`showToAll: true\` en una \`entity\` muestra su nombre e imagen a todos aunque los jugadores no tengan permiso sobre la ficha del actor.${mode === "board" ? `

## 4. Caminos
Cuando el master «activa» un personaje, la pizarra le propone seguir **su camino**: las piezas unidas a ese personaje por hilos, de cercana a lejana, para revelarlas una a una. Por eso **conecta cada personaje con las pistas, documentos y lugares que llevan a él o salen de él, en el orden en que se descubrirían**. Una cadena clara (persona → pista → documento → otra persona) es mejor que muchos hilos cruzados.` : ""}`;

const OUTPUT_RULES = `## Antes de responder, comprueba
- El JSON es válido y es lo único que hay en tu respuesta (más, si quieres, una frase antes).
- Todos los \`ref\` son únicos y todos los \`layer\` existen en \`layers\`.
- Todos los ids (papel, marco, sello, marca, sujeción, colocación, fondo, color, estilo) están en las listas.
- No has inventado hechos que no estén en la aventura.`;

/**
 * Prompt completo para dárselo a una IA junto con la aventura. Se genera desde el catálogo real del módulo.
 * @param {{mode?: "board"|"box"}} [options]  «board»: pizarra montada (posiciones e hilos). «box»: caja de elementos (sin estructura).
 */
export function buildPrompt({ mode = "board" } = {}) {
  const masks = MASKS.map((m) => `"${m.id}"`).join(", ");
  return mode === "box" ? buildBoxPrompt(masks) : buildBoardPrompt(masks);
}

function buildBoardPrompt(masks) {
  return `# Tarea: componer una pizarra de investigación a partir de una aventura

Eres un asistente de preparación de partidas de rol. Voy a darte una aventura (texto, PDF o notas). Quiero que la leas entera y compongas **una pizarra de investigación** para el módulo de Foundry VTT «MR- Pizarra». La pizarra la usará el Director de juego (el «master») para tenerlo todo colocado desde el principio y **ir desvelando** piezas a los jugadores durante la partida.

${EXTRACT}
Las conexiones entre todo esto serán los hilos.

${REPRESENT}

${LAYERS("board")}

## 5. Hilos (conexiones)
Une piezas con \`links\`. Elige el color y el estilo con este significado y mantenlo en toda la pizarra:
- Color: \`rojo\` = relación directa o hecho comprobado · \`azul\` = pista o hipótesis débil · \`verde\` = coartada o inocencia · \`ambar\` = sospecha o duda · \`violeta\` = vínculo oculto o secreto · \`negro\` = parentesco o pasado común.
- Estilo: \`solido\` = confirmado · \`punteado\` = hipótesis · \`discontinuo\` = contradicción o dato dudoso.
- \`label\`: etiqueta corta (máx. 40 caracteres) que diga qué une las piezas («coartada falsa», «vio el barco»).
No conectes todo con todo: solo las relaciones que ayuden a investigar. Un hilo solo se ve si sus dos piezas son visibles.

## 6. Composición (posiciones)
El lienzo mide **3200 × 2000** (origen arriba a la izquierda; x → derecha, y → abajo). \`x\`,\`y\` son la esquina superior izquierda de la pieza.
- Deja un margen de 150 px con el borde y al menos 60 px entre piezas.
- **Agrupa por tema**: el caso o la víctima en el centro (≈ x 1400–1800, y 800–1100); los sospechosos en un arco a su alrededor; cada pista cerca de la persona o lugar al que apunta; los documentos y recortes en una zona propia; la cronología en una fila de izquierda a derecha en orden temporal.
- Tamaños (\`w\`, ancho en px; el alto sale solo): nota 190 · recorte 280–360 · foto/ficha 210–240 · sello 230 · marca 170. Alto aproximado: nota = w · recorte = w×1,25 · foto/ficha = w×1,2 · sello rectangular = w×0,36.
- \`rot\` (giro) entre −6 y 6 grados, distinto en cada pieza, para que parezca colgado a mano.
- Calcula las posiciones para que **no se solapen** piezas del mismo grupo. Si tienes muchas piezas, usa todo el lienzo.

## 7. Formato de salida (muy importante)
Responde con **un único bloque de código \`\`\`json\`\`\`** que contenga un objeto JSON válido (sin comentarios, sin comas finales) y **nada más después**. Estructura:

\`\`\`json
{
  "format": "${IMPORT_FORMAT}",
  "version": ${IMPORT_VERSION},
  "mode": "board",
  "title": "Nombre del caso",
  "background": "corcho-claro",
  "pinPreset": { "pin": "auto", "color": "", "layout": "auto" },
  "layers": [ /* capas */ ],
  "items": [ /* piezas */ ],
  "links": [ /* hilos */ ]
}
\`\`\`

### Capas (\`layers\`)
\`{ "ref": "acto1", "name": "Planteamiento", "revealed": true }\`. \`ref\` único y corto; \`revealed\` indica si está visible para los jugadores al empezar. Máximo ${BOARD.maxLayers}.

### Piezas (\`items\`)
Cada pieza lleva \`ref\` (identificador único y corto que inventas: \`"npc-voss"\`, \`"pista-llave"\`), \`type\`, \`layer\` (el \`ref\` de su capa), \`x\`, \`y\`, \`w\` (opcional), \`rot\` (opcional) y los campos de su tipo. Máximo ${BOARD.maxItems} piezas y ${BOARD.maxLinks} hilos. Nunca uses un id que no esté en las listas de abajo.

${PIECES_TABLE(masks)}

Campos opcionales de sujeción en \`note\`, \`clipping\`, \`photo\`, \`entity\` y \`journal\`: \`pin\` ("auto", "none" o un id de la lista E; normalmente "auto"), \`pinLayout\` ("auto" o un id de la lista F), \`pinColor\` ("" para heredar o un color "#rrggbb"). Si no los pones, se usa la sujeción por defecto de la pizarra.

### Hilos (\`links\`)
\`{ "from": "ref-a", "to": "ref-b", "color": "rojo", "style": "solido", "label": "texto corto" }\`. \`from\` y \`to\` son \`ref\` de piezas que existen en \`items\`.

${catalog()}

## 8. Ejemplo mínimo (solo para ilustrar la forma; no copies su contenido)
\`\`\`json
{
  "format": "${IMPORT_FORMAT}",
  "version": ${IMPORT_VERSION},
  "mode": "board",
  "title": "El caso del faro",
  "background": "corcho-noir",
  "layers": [
    { "ref": "inicio", "name": "Planteamiento", "revealed": true },
    { "ref": "giro", "name": "El giro", "revealed": false }
  ],
  "items": [
    { "ref": "caso", "type": "clipping", "layer": "inicio", "x": 1350, "y": 780, "w": 340, "paper": "periodico-2", "title": "Hallan muerto al farero", "text": "El cuerpo de Alfred Hargreaves fue encontrado en la sala de la linterna…", "rot": -2 },
    { "ref": "viuda", "type": "entity", "layer": "inicio", "kind": "Actor", "name": "Eleanor Hargreaves", "x": 900, "y": 560, "frame": "polaroid", "rot": 3 },
    { "ref": "carta", "type": "journal", "layer": "giro", "title": "Carta anónima", "text": "Sé lo que hicisteis en el muelle…", "x": 1900, "y": 560 },
    { "ref": "llave", "type": "note", "layer": "giro", "x": 1250, "y": 1180, "color": "amarillo", "text": "La segunda llave nunca apareció", "rot": 4 },
    { "ref": "sello", "type": "stamp", "layer": "inicio", "x": 1420, "y": 640, "kind": "marco-rect-rojo", "text": "SIN RESOLVER", "rot": -5 }
  ],
  "links": [
    { "from": "viuda", "to": "caso", "color": "rojo", "style": "solido", "label": "esposa de la víctima" },
    { "from": "carta", "to": "viuda", "color": "ambar", "style": "punteado", "label": "¿quién la escribió?" }
  ]
}
\`\`\`

${OUTPUT_RULES}
- Las piezas no se solapan y están dentro de 3200 × 2000.
- Cada personaje tiene un camino de hilos que lleva a sus pistas.

Ahora te paso la aventura:
`;
}

function buildBoxPrompt(masks) {
  return `# Tarea: preparar una caja de elementos de investigación a partir de una aventura

Eres un asistente de preparación de partidas de rol. Voy a darte una aventura (texto, PDF o notas). Quiero que la leas entera y prepares **una caja de elementos** para el módulo de Foundry VTT «MR- Pizarra». A diferencia de una pizarra montada, **aquí no hay estructura**: las piezas se guardan en una caja y **los jugadores las van sacando y colocando como quieran** en su pizarra, creando ellos mismos las conexiones. El Director de juego (el «master») decide qué piezas tienen disponibles en cada momento.

Por eso: **no hay posiciones ni hilos**, y cada pieza debe entenderse **por sí sola** (nombre completo, qué es, dónde se encontró, qué aporta), porque nada la conecta con el resto.

${EXTRACT}

${REPRESENT}

## 3. Grupos de la caja
La caja se organiza por secciones. Pon en cada pieza un \`group\` corto (máx. 30 caracteres) y **usa pocos y claros**, por ejemplo: «Personajes», «Lugares», «Pistas», «Documentos», «Pruebas». Es lo que usarán los jugadores para encontrar las piezas.

${LAYERS("box")}

## 4. Formato de salida (muy importante)
Responde con **un único bloque de código \`\`\`json\`\`\`** que contenga un objeto JSON válido (sin comentarios, sin comas finales) y **nada más después**. Estructura:

\`\`\`json
{
  "format": "${IMPORT_FORMAT}",
  "version": ${IMPORT_VERSION},
  "mode": "box",
  "title": "Nombre del caso",
  "layers": [ /* capas */ ],
  "items": [ /* piezas */ ]
}
\`\`\`

No incluyas \`links\`, \`x\`, \`y\` ni \`rot\`: se ignoran. Máximo ${BOARD.maxItems} piezas.

### Capas (\`layers\`)
\`{ "ref": "acto1", "name": "Planteamiento", "revealed": true }\`. \`ref\` único y corto; \`revealed\` indica si esas piezas están disponibles para los jugadores al empezar. Máximo ${BOARD.maxLayers}.

### Piezas (\`items\`)
Cada pieza lleva \`ref\` (identificador único y corto que inventas), \`type\`, \`group\`, \`layer\` (el \`ref\` de su capa) y los campos de su tipo. Nunca uses un id que no esté en las listas de abajo.

${PIECES_TABLE(masks)}

${catalog()}

## 5. Ejemplo mínimo (solo para ilustrar la forma; no copies su contenido)
\`\`\`json
{
  "format": "${IMPORT_FORMAT}",
  "version": ${IMPORT_VERSION},
  "mode": "box",
  "title": "El caso del faro",
  "layers": [
    { "ref": "inicio", "name": "Al empezar", "revealed": true },
    { "ref": "giro", "name": "Tras la autopsia", "revealed": false }
  ],
  "items": [
    { "ref": "caso", "type": "clipping", "group": "Documentos", "layer": "inicio", "paper": "periodico-2", "title": "Hallan muerto al farero", "text": "El cuerpo de Alfred Hargreaves fue encontrado en la sala de la linterna…" },
    { "ref": "viuda", "type": "entity", "group": "Personajes", "layer": "inicio", "kind": "Actor", "name": "Eleanor Hargreaves", "frame": "polaroid" },
    { "ref": "carta", "type": "journal", "group": "Documentos", "layer": "giro", "title": "Carta anónima", "text": "Sé lo que hicisteis en el muelle…" },
    { "ref": "llave", "type": "note", "group": "Pistas", "layer": "giro", "color": "amarillo", "text": "La segunda llave del faro nunca apareció" }
  ]
}
\`\`\`

${OUTPUT_RULES}
- Cada pieza se entiende por sí sola, sin depender de hilos.
- Los \`group\` son pocos y claros.

Ahora te paso la aventura:
`;
}
