/** Pinta cada pieza de la pizarra (HTML) a partir de sus datos y de lo que la persona puede ver. */
import { asset, DEFAULT_WIDTH, TABLES, PAPERS, FRAMES, DEFAULT_PIN_PRESET, look, rng } from "./rules.mjs";
import { esc, t, ratioOf, holeOf, MANIFEST } from "./util.mjs";
import { resolveJournal, resolveEntity } from "./refs.mjs";

const BLOCKED_PAPERS = new Set(["sobre", "fotocopia"]);
const JOURNAL_PAPERS = PAPERS.filter((p) => !BLOCKED_PAPERS.has(p.style));
const MYSTERY = "icons/svg/mystery-man.svg";

/** Tamaño de cada adorno: las chinchetas, clips y grapas miden siempre lo mismo; el celo se adapta algo a la pieza. */
const PIN_WIDTH = {
  chincheta: () => 30,
  clip: () => 34,
  grapa: () => 34,
  cinta: (w, corner) => Math.round(Math.min(corner ? 120 : 150, Math.max(corner ? 70 : 84, w * (corner ? 0.36 : 0.46)))),
};
/** Cuánto entra el centro del adorno hacia dentro del papel desde su borde. */
const PIN_INSET = { chincheta: 14, clip: 8, grapa: 8, cinta: 0 };
const TINTABLE = new Set(["chincheta", "cinta"]);

export const visibleTo = (item) => game.user.isGM || (!item.hidden && (!item.owner || item.owner === game.user.id));

export function widthOf(item) {
  if (item.w) return item.w;
  if (item.type === "stamp") {
    const r = ratioOf("sellos", item.kind);
    return r < 0.5 ? 250 : r < 0.8 ? 220 : 150;
  }
  if (item.type === "mark") {
    const r = ratioOf(TABLES.mark.get(item.kind)?.folder ?? "sellos", item.kind);
    return r < 0.4 ? 340 : DEFAULT_WIDTH.mark;
  }
  return DEFAULT_WIDTH[item.type];
}

/** Alto / ancho de la pieza para los tipos con contorno. */
export function ratioFor(item) {
  if (item.type === "clipping") return item.ratio ?? ratioOf("recortes", item.paper);
  if (item.type === "journal") return item.ratio ?? 1.25;
  return null;
}

/** Punto del borde (px) de la pieza en la posición relativa (x,y) de una sujeción, siguiendo el contorno rasgado. */
function edgePoint(maskId, spot, w, h) {
  const edge = maskId && maskId !== "none" ? MANIFEST[`bordes/${maskId}`]?.edge : null;
  const at = (arr, f) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(f * arr.length)))];
  if (spot.y === 0 || spot.y === 1) {
    const y = edge ? (at(spot.y === 0 ? edge.top : edge.bottom, spot.x) / 100) * h : spot.y * h;
    return { x: spot.x * w, y, inward: { x: 0, y: spot.y === 0 ? 1 : -1 } };
  }
  const x = edge ? (at(spot.x === 0 ? edge.left : edge.right, spot.y) / 100) * w : spot.x * w;
  return { x, y: spot.y * h, inward: { x: spot.x === 0 ? 1 : -1, y: 0 } };
}

/** Geometría de las sujeciones de una pieza: posiciones, tamaños, hasta dónde invaden el papel y el punto de anclaje de los hilos. */
export function pinsGeometry(L, w, h, maskId) {
  const out = [];
  let top = 0;
  let bottom = 0;
  for (const spot of L.pins) {
    const pin = TABLES.pin.get(spot.pin);
    if (!pin) continue;
    const corner = Boolean(spot.c);
    const width = PIN_WIDTH[pin.kind](w, corner);
    const height = width * (MANIFEST[`adornos/${pin.id}`] ? MANIFEST[`adornos/${pin.id}`].h / MANIFEST[`adornos/${pin.id}`].w : 1);
    const p = edgePoint(maskId, { x: spot.x, y: spot.y }, w, h);
    const inset = (PIN_INSET[pin.kind] ?? 0) + (pin.kind === "clip" ? height * 0.2 : 0);
    const cx = p.x + p.inward.x * inset + spot.dx;
    const cy = p.y + p.inward.y * inset;
    const r = (spot.rot * Math.PI) / 180;
    const half = Math.abs((width / 2) * Math.sin(r)) + Math.abs((height / 2) * Math.cos(r)); // medio alto de la caja girada
    // Un adorno centrado reserva su hueco entero; uno de esquina solo una franja (la zona segura del contorno ya deja la esquina libre).
    const centered = !spot.c && !spot.s;
    if (spot.y === 0) top = Math.max(top, centered ? cy + half : half * 0.55 + 4);
    if (spot.y === 1) bottom = Math.max(bottom, centered ? h - (cy - half) : half * 0.55 + 4);
    out.push({ pin, spot, cx, cy, width, height, rot: spot.rot + (spot.y === 1 && pin.kind === "clip" ? 180 : 0) });
  }
  const first = out[0];
  return { pins: out, padTop: top, padBottom: bottom, anchor: first ? { x: first.cx, y: first.cy } : { x: w / 2, y: 10 } };
}

/** Una sujeción por entrada: posición del centro dentro de la pieza (px), ancho, giro y teñido. Las pinta `pinElementHTML` en una capa propia. */
function pinSpecs(g, color) {
  return g.pins.map(({ pin, cx, cy, width, rot }) => ({ id: pin.id, kind: pin.kind, x: Math.round(cx * 10) / 10, y: Math.round(cy * 10) / 10, w: width, r: rot, tint: color && TINTABLE.has(pin.kind) ? color : "" }));
}

/** HTML de una sujeción para la capa que va por encima de los hilos (posición y giro los pone la hoja). */
export function pinElementHTML(spec, itemId, hidden) {
  const url = asset("adornos", spec.id);
  return `<span class="mrp-pin mrp-pin-${spec.kind} ${spec.tint ? "mrp-tinted" : ""} ${hidden ? "mrp-hidden" : ""}" data-item="${itemId}" data-x="${spec.x}" data-y="${spec.y}" data-r="${spec.r}" style="width:${spec.w}px;${spec.tint ? `--tint:${spec.tint};--mask:url(${foundry.utils.getRoute(url)})` : ""}"><img src="${url}" alt="" draggable="false"></span>`;
}

/** Rectángulo de texto (px) dentro de una pieza: la zona segura del contorno, sin pisar los adornos. */
function textBox(maskId, w, ratio, g, minTop = 0) {
  const safe = (maskId && maskId !== "none" && MANIFEST[`bordes/${maskId}`]?.safe) || [7, 7, 7, 7];
  const h = w * ratio;
  const m = 2.5; // margen extra, en %
  const top = Math.max(((safe[0] + m) / 100) * h, g.padTop + 6, (minTop / 100) * h);
  const bottom = Math.max(((safe[2] + m) / 100) * h, g.padBottom + 6);
  return `top:${top.toFixed(1)}px;right:${safe[1] + m}%;bottom:${bottom.toFixed(1)}px;left:${safe[3] + m}%`;
}

export function resolveItem(item) {
  if (item.type === "journal") return resolveJournal(item.uuid);
  if (item.type === "entity") return resolveEntity(item.uuid);
  return null;
}

const img = (cls, folder, id, extra = "") => `<img class="${cls}" src="${asset(folder, id)}" alt="" draggable="false" ${extra}>`;
const field = (tag, cls, name, ph, text) => `<${tag} class="${cls}" data-field="${name}" data-ph="${esc(ph)}">${esc(text)}</${tag}>`;

function paperHTML(paperId, { title, body, editable, ratio, maskId, extra = "", w, g, long }) {
  const paper = TABLES.paper.get(paperId) ?? PAPERS[0];
  const mask = maskId && maskId !== "none" ? `-webkit-mask-image:url(${asset("bordes", maskId)});mask-image:url(${asset("bordes", maskId)});` : "";
  const box = textBox(maskId, w, ratio, g, paper.style === "sobre" ? 30 : 0);
  const head = editable ? field("h4", "mrp-headline", "title", t("phHeadline"), title) : title ? `<h4 class="mrp-headline">${esc(title)}</h4>` : "";
  const copy = editable ? field("div", "mrp-copy", "text", t("phBody"), body) : `<div class="mrp-copy">${esc(body)}</div>`;
  return `<div class="mrp-paper mrp-style-${paper.style} ${long ? "mrp-cols" : ""}" data-paper="${paper.id}" style="aspect-ratio:1/${ratio};background-image:url(${asset("recortes", paper.id)});${mask}">
    <div class="mrp-text" style="${box}">${head}${copy}${extra}</div></div>`;
}

function frameHTML(frame, src, caption, { editable = false, field: canEditCaption = false } = {}) {
  const [top, right, bottom, left] = holeOf(frame);
  const inside = bottom >= 14;
  const capAttrs = canEditCaption ? ` data-field="text" data-ph="${esc(t("phCaption"))}"` : "";
  const cap = caption || canEditCaption ? `<span class="mrp-caption ${inside ? "mrp-in-frame" : ""}"${capAttrs} style="${inside ? `top:${100 - bottom}%;height:${bottom}%` : ""}">${esc(caption)}</span>` : "";
  const pic = src ? `<img class="mrp-pic" src="${esc(src)}" alt="${esc(caption)}" draggable="false">` : `<div class="mrp-nopic"><i class="fa-regular fa-image"></i><span>${esc(t("phImage"))}</span></div>`;
  return `<div class="mrp-paper mrp-photo" style="aspect-ratio:1/${ratioOf("fotos", frame)}">
    <div class="mrp-picbox" style="top:${top}%;right:${right}%;bottom:${bottom}%;left:${left}%">${pic}</div>
    ${img("mrp-frameimg", "fotos", frame)}${cap}</div>`;
}

const redactBars = (id) => {
  const random = rng(`${id}:bars`);
  return Array.from({ length: 6 }, () => `<i style="width:${Math.round(55 + random() * 45)}%"></i>`).join("");
};

/** HTML interior de cada tipo. */
function inner(id, item, ref, L, w, g, editable) {
  switch (item.type) {
    case "note":
      return `<div class="mrp-paper mrp-note" data-color="${item.color}" style="aspect-ratio:1/1;background-image:url(${asset("recortes", `postit-${item.color}`)})">${field("div", "mrp-text mrp-copy", "text", t("phNote"), item.text).replace('class="mrp-text mrp-copy"', `class="mrp-text mrp-copy" style="top:${Math.max(w * 0.15, g.padTop + 6).toFixed(1)}px"`)}</div>`;
    case "clipping":
      return paperHTML(item.paper, { title: item.title, body: item.text, editable, ratio: ratioFor(item), maskId: L.mask, w, g, long: item.text.length > 260 });
    case "photo":
      return frameHTML(item.frame, item.src, item.text, { field: editable });
    case "stamp": {
      const stamp = TABLES.stamp.get(item.kind);
      return `<div class="mrp-paper mrp-stampwrap" style="aspect-ratio:1/${ratioOf("sellos", item.kind)};color:${stamp?.ink ?? "#b8352c"}">${img("mrp-stampimg", "sellos", item.kind)}${field("span", "mrp-stamptext", "text", t("phStamp"), item.text)}</div>`;
    }
    case "mark": {
      const mark = TABLES.mark.get(item.kind);
      return `<div class="mrp-paper mrp-markwrap ${mark?.multiply ? "mrp-multiply" : ""}" style="aspect-ratio:1/${ratioOf(mark?.folder ?? "sellos", item.kind)}">${img("mrp-markimg", mark?.folder ?? "sellos", item.kind)}</div>`;
    }
    case "entity": {
      const name = ref.level === "none" ? "???" : ref.title;
      return frameHTML(item.frame, ref.src || MYSTERY, name);
    }
    case "journal": {
      const random = rng(`${id}:journal`);
      const paper = JOURNAL_PAPERS[Math.floor(random() * JOURNAL_PAPERS.length)].id;
      const ratio = ratioFor(item);
      const opts = { ratio, maskId: L.mask, w, g };
      if (ref.level === "none")
        return paperHTML("sobre-manila", { ...opts, body: `<span class="mrp-question">${ref.missing && game.user.isGM ? "✕" : "?"}</span>`, extra: `<div class="mrp-tag">${t(ref.missing && game.user.isGM ? "deleted" : "unknown")}</div>` });
      if (ref.level === "limited" || !ref.kind)
        return paperHTML(paper, { ...opts, title: ref.title, body: "", extra: `<span class="mrp-redact">${redactBars(id)}</span><div class="mrp-seal">${t("reserved")}</div>` });
      if (ref.kind === "image") return frameHTML(FRAMES[Math.floor(random() * FRAMES.length)].id, ref.src, ref.caption || ref.title);
      return paperHTML(paper, { ...opts, title: ref.title, body: ref.body, long: (ref.body ?? "").length > 260 });
    }
  }
  return "";
}

const TEXT_TYPES = new Set(["note", "clipping", "photo", "stamp"]);

/** Devuelve {html, sig} de una pieza lista para insertar. `board` aporta la sujeción por defecto. */
export function renderItem(id, item, board = {}) {
  const ref = resolveItem(item);
  const preset = { ...DEFAULT_PIN_PRESET, ...(board.pinPreset ?? {}) };
  const L = look(id, item, preset);
  const w = widthOf(item);
  const ratio = ratioFor(item) ?? 1;
  const hasMask = ["clipping", "journal"].includes(item.type);
  // alto aproximado para colocar las sujeciones (el real lo da el layout, pero la proporción es conocida)
  const h = item.type === "photo" || item.type === "entity" ? w * ratioOf("fotos", item.frame) : item.type === "note" ? w : w * ratio;
  const g = pinsGeometry(L, w, h, hasMask ? L.mask : "none");
  const editable = TEXT_TYPES.has(item.type) && game.user.isGM !== undefined;
  const badges = [
    item.hidden ? `<span class="mrp-badge mrp-badge-hidden"><i class="fa-solid fa-eye-slash"></i> ${t("hiddenBadge")}</span>` : "",
    item.owner ? `<span class="mrp-badge mrp-badge-private"><i class="fa-solid fa-lock"></i> ${t("privateBadge")}${game.user.isGM ? ` · ${esc(game.users.get(item.owner)?.name ?? "")}` : ""}</span>` : "",
  ].join("");
  const label = esc(item.title || item.text || ref?.title || t(item.type)).slice(0, 80);
  const html = `<div class="mrp-item mrp-t-${item.type} ${item.hidden ? "mrp-hidden" : ""} ${item.type === "mark" && TABLES.mark.get(item.kind)?.multiply ? "mrp-multiply" : ""}" data-id="${id}" data-type="${item.type}" data-ax="${g.anchor.x.toFixed(1)}" data-ay="${g.anchor.y.toFixed(1)}" data-rot="${L.rot}" data-pins="${esc(JSON.stringify(pinSpecs(g, L.color)))}" tabindex="0" role="group" aria-label="${t(item.type)}: ${label}"
    style="left:${item.x}px;top:${item.y}px;width:${w}px;z-index:${item.z};--w:${w}px">
    <div class="mrp-lift" style="transform:rotate(${L.rot}deg) skewX(${L.skew}deg)">${inner(id, item, ref, L, w, g, editable)}</div>
    ${badges}</div>`;
  return { html, sig: `${JSON.stringify(item)}|${JSON.stringify(preset)}|${ref?.sig ?? ""}|${game.user.isGM}` };
}
