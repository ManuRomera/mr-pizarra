/** Pinta cada pieza de la pizarra (HTML) a partir de sus datos y de lo que la persona puede ver. */
import { asset, DEFAULT_WIDTH, TABLES, PAPERS, FRAMES, look, hash, rng } from "./rules.mjs";
import { esc, t, ratioOf, holeOf, MANIFEST } from "./util.mjs";
import { resolveJournal, resolveEntity } from "./refs.mjs";

const BLOCKED_PAPERS = new Set(["sobre", "fotocopia"]);
const JOURNAL_PAPERS = PAPERS.filter((p) => !BLOCKED_PAPERS.has(p.style));
const MYSTERY = "icons/svg/mystery-man.svg";

/** Tamaño del adorno y hasta dónde entra por debajo del borde superior de la pieza (para no tapar el texto). */
const PIN_GEO = {
  chincheta: { scale: 0.11, min: 26, top: () => 14, below: (h) => 14 + h / 2 },
  clip: { scale: 0.13, min: 28, top: (h) => h * 0.22, below: (h) => h * 0.72 },
  cinta: { scale: 0.5, min: 80, top: () => 0, below: (h) => h / 2 },
  grapa: { scale: 0.16, min: 24, top: () => 8, below: (h) => 8 + h / 2 },
};
/** Altura (px) a la que empieza el papel bajo el punto `fx` (0‒1) de un contorno irregular. */
export function edgeAt(maskId, fx, h) {
  const top = maskId && maskId !== "none" ? MANIFEST[`bordes/${maskId}`]?.top : null;
  if (!top) return 0;
  const i = Math.min(top.length - 1, Math.max(0, Math.floor(fx * top.length)));
  return (top[i] / 100) * h;
}

export function pinGeometry(pinId, w, corner, edge = 0) {
  const pin = TABLES.pin.get(pinId);
  const geo = pin && PIN_GEO[pin.kind];
  if (!geo) return null;
  const width = Math.max(geo.min, w * geo.scale);
  const height = width * ratioOf("adornos", pin.id);
  const top = (corner && pin.kind === "cinta" ? 8 : geo.top(height)) + edge;
  return { pin, width, height, top, below: corner ? 0 : geo.below(height) + edge };
}

/** Rectángulo de texto (px) dentro de una pieza: la zona segura del contorno, sin pisar el adorno. */
function textBox(maskId, w, ratio, pad, minTop = 0) {
  const safe = (maskId && maskId !== "none" && MANIFEST[`bordes/${maskId}`]?.safe) || [7, 7, 7, 7];
  const h = w * ratio;
  const m = 2.5; // margen extra, en %
  const top = Math.max((safe[0] + m) / 100 * h, pad + 6, minTop / 100 * h);
  return `top:${top.toFixed(1)}px;right:${safe[1] + m}%;bottom:${safe[2] + m}%;left:${safe[3] + m}%`;
}

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

export function resolveItem(item) {
  if (item.type === "journal") return resolveJournal(item.uuid);
  if (item.type === "entity") return resolveEntity(item.uuid);
  return null;
}

const img = (cls, folder, id, extra = "") => `<img class="${cls}" src="${asset(folder, id)}" alt="" draggable="false" ${extra}>`;

function paperHTML(id, paperId, { title, body, ratio, maskId, extra = "", w, pad = 0 }) {
  const paper = TABLES.paper.get(paperId) ?? PAPERS[0];
  const mask = maskId && maskId !== "none" ? `-webkit-mask-image:url(${asset("bordes", maskId)});mask-image:url(${asset("bordes", maskId)});` : "";
  const box = textBox(maskId, w, ratio, pad, paper.style === "sobre" ? 30 : 0);
  return `<div class="mrp-paper mrp-style-${paper.style}" data-paper="${paper.id}" style="aspect-ratio:1/${ratio};background-image:url(${asset("recortes", paper.id)});${mask}">
    <div class="mrp-text" style="${box}">${title ? `<h4 class="mrp-headline">${esc(title)}</h4>` : ""}<div class="mrp-copy">${body}</div>${extra}</div></div>`;
}

function frameHTML(frame, src, caption) {
  const [top, right, bottom, left] = holeOf(frame);
  const inside = bottom >= 14;
  const cap = caption ? `<span class="mrp-caption ${inside ? "mrp-in-frame" : ""}" style="${inside ? `top:${100 - bottom}%;height:${bottom}%` : ""}">${esc(caption)}</span>` : "";
  return `<div class="mrp-paper mrp-photo" style="aspect-ratio:1/${ratioOf("fotos", frame)}">
    <div class="mrp-picbox" style="top:${top}%;right:${right}%;bottom:${bottom}%;left:${left}%"><img class="mrp-pic" src="${esc(src)}" alt="" draggable="false"></div>
    ${img("mrp-frameimg", "fotos", frame)}${cap}</div>`;
}

const redactBars = (id) => {
  const random = rng(`${id}:bars`);
  return Array.from({ length: 6 }, () => `<i style="width:${Math.round(55 + random() * 45)}%"></i>`).join("");
};

/** HTML interior y proporción de cada tipo. */
function inner(id, item, ref, L, w, pad) {
  switch (item.type) {
    case "note":
      return `<div class="mrp-paper mrp-note" data-color="${item.color}" style="aspect-ratio:1/1;background-image:url(${asset("recortes", `postit-${item.color}`)})"><div class="mrp-text mrp-copy" style="top:${Math.max(w * 0.15, pad + 6).toFixed(1)}px">${esc(item.text)}</div></div>`;
    case "clipping":
      return paperHTML(id, item.paper, { title: item.title, body: esc(item.text), ratio: item.ratio ?? ratioOf("recortes", item.paper), maskId: L.mask, w, pad });
    case "photo":
      return frameHTML(item.frame, item.src, item.text);
    case "stamp": {
      const stamp = TABLES.stamp.get(item.kind);
      return `<div class="mrp-paper mrp-stampwrap" style="aspect-ratio:1/${ratioOf("sellos", item.kind)};color:${stamp?.ink ?? "#b8352c"}">${img("mrp-stampimg", "sellos", item.kind)}<span class="mrp-stamptext">${esc(item.text)}</span></div>`;
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
      const ratio = item.ratio ?? 1.25;
      if (ref.level === "none")
        return paperHTML(id, "sobre-manila", { body: `<span class="mrp-question">${ref.missing && game.user.isGM ? "✕" : "?"}</span>`, ratio, maskId: L.mask, w, pad, extra: `<div class="mrp-tag">${t(ref.missing && game.user.isGM ? "deleted" : "unknown")}</div>` });
      if (ref.level === "limited" || !ref.kind)
        return paperHTML(id, paper, { title: ref.title, body: `<span class="mrp-redact">${redactBars(id)}</span>`, ratio, maskId: L.mask, w, pad, extra: `<div class="mrp-seal">${t("reserved")}</div>` });
      if (ref.kind === "image") return frameHTML(FRAMES[Math.floor(random() * FRAMES.length)].id, ref.src, ref.caption || ref.title);
      return paperHTML(id, paper, { title: ref.title, body: esc(ref.body), ratio, maskId: L.mask, w, pad });
    }
  }
  return "";
}

/** Devuelve {html, sig} de una pieza lista para insertar. */
export function renderItem(id, item) {
  const ref = resolveItem(item);
  const L = look(id, item);
  const w = widthOf(item);
  const corner = ["photo", "entity"].includes(item.type);
  const hasMask = ["clipping", "journal"].includes(item.type);
  const ratio = hasMask ? (item.ratio ?? (item.type === "journal" ? 1.25 : ratioOf("recortes", item.paper))) : 1;
  const edge = hasMask ? edgeAt(L.mask, L.pinFx + L.pinX / w, w * ratio) : 0;
  const geo = pinGeometry(L.pin, w, corner, edge);
  const pinHTML = geo
    ? `<img class="mrp-pin mrp-pin-${geo.pin.kind}" src="${asset("adornos", geo.pin.id)}" alt="" draggable="false" style="--fx:${L.pinFx};--pinx:${L.pinX}px;--pinr:${L.pinRot}deg;--pinw:${geo.width.toFixed(1)}px;--pint:${geo.top.toFixed(1)}px">`
    : "";
  const pad = geo?.below ?? 0;
  const badges = [
    item.hidden ? `<span class="mrp-badge mrp-badge-hidden"><i class="fa-solid fa-eye-slash"></i> ${t("hiddenBadge")}</span>` : "",
    item.owner ? `<span class="mrp-badge mrp-badge-private"><i class="fa-solid fa-lock"></i> ${t("privateBadge")}${game.user.isGM ? ` · ${esc(game.users.get(item.owner)?.name ?? "")}` : ""}</span>` : "",
  ].join("");
  const label = esc(item.title || item.text || ref?.title || t(item.type)).slice(0, 80);
  const html = `<div class="mrp-item mrp-t-${item.type} ${item.hidden ? "mrp-hidden" : ""} ${item.type === "mark" && TABLES.mark.get(item.kind)?.multiply ? "mrp-multiply" : ""}" data-id="${id}" data-type="${item.type}" data-fx="${L.pinFx}" data-pinx="${L.pinX}" data-pint="${geo?.top ?? 8}" data-rot="${L.rot}" tabindex="0" role="group" aria-label="${label}"
    style="left:${item.x}px;top:${item.y}px;width:${w}px;z-index:${item.z};--w:${w}px">
    <div class="mrp-lift" style="transform:rotate(${L.rot}deg) skewX(${L.skew}deg)">${inner(id, item, ref, L, w, pad)}${pinHTML}</div>
    ${badges}</div>`;
  return { html, sig: `${JSON.stringify(item)}|${ref?.sig ?? ""}|${game.user.isGM}` };
}

export const hashOf = hash;
