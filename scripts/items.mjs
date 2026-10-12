/** Pinta cada pieza de la pizarra (HTML) a partir de sus datos y de lo que la persona puede ver. */
import { asset, DEFAULT_WIDTH, TABLES, PAPERS, FRAMES, look, hash, rng } from "./rules.mjs";
import { esc, t, ratioOf, holeOf } from "./util.mjs";
import { resolveJournal, resolveEntity } from "./refs.mjs";

const BLOCKED_PAPERS = new Set(["sobre", "fotocopia"]);
const JOURNAL_PAPERS = PAPERS.filter((p) => !BLOCKED_PAPERS.has(p.style));
const MYSTERY = "icons/svg/mystery-man.svg";

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

function paperHTML(id, paperId, { title, body, ratio, maskId, extra = "" }) {
  const paper = TABLES.paper.get(paperId) ?? PAPERS[0];
  const mask = maskId && maskId !== "none" ? `-webkit-mask-image:url(${asset("bordes", maskId)});mask-image:url(${asset("bordes", maskId)});` : "";
  return `<div class="mrp-paper mrp-style-${paper.style}" data-paper="${paper.id}" style="aspect-ratio:1/${ratio};background-image:url(${asset("recortes", paper.id)});${mask}">
    <div class="mrp-text">${title ? `<h4 class="mrp-headline">${esc(title)}</h4>` : ""}<div class="mrp-copy">${body}</div>${extra}</div></div>`;
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
function inner(id, item, ref, L) {
  switch (item.type) {
    case "note":
      return `<div class="mrp-paper mrp-note" data-color="${item.color}" style="aspect-ratio:1/1;background-image:url(${asset("recortes", `postit-${item.color}`)})"><div class="mrp-text mrp-copy">${esc(item.text)}</div></div>`;
    case "clipping":
      return paperHTML(id, item.paper, { title: item.title, body: esc(item.text), ratio: item.ratio ?? ratioOf("recortes", item.paper), maskId: L.mask });
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
        return paperHTML(id, "sobre-manila", { body: `<span class="mrp-question">${ref.missing && game.user.isGM ? "✕" : "?"}</span>`, ratio, maskId: L.mask, extra: `<div class="mrp-tag">${t(ref.missing && game.user.isGM ? "deleted" : "unknown")}</div>` });
      if (ref.level === "limited" || !ref.kind)
        return paperHTML(id, paper, { title: ref.title, body: `<span class="mrp-redact">${redactBars(id)}</span>`, ratio, maskId: L.mask, extra: `<div class="mrp-seal">${t("reserved")}</div>` });
      if (ref.kind === "image") return frameHTML(FRAMES[Math.floor(random() * FRAMES.length)].id, ref.src, ref.caption || ref.title);
      return paperHTML(id, paper, { title: ref.title, body: esc(ref.body), ratio, maskId: L.mask });
    }
  }
  return "";
}

const PIN_SCALE = { chincheta: 0.12, clip: 0.09, cinta: 0.5, grapa: 0.18, alfiler: 0.3 };

/** Devuelve {html, sig} de una pieza lista para insertar. */
export function renderItem(id, item) {
  const ref = resolveItem(item);
  const L = look(id, item);
  const w = widthOf(item);
  const pin = TABLES.pin.get(L.pin);
  const pinHTML = pin
    ? `<img class="mrp-pin mrp-pin-${pin.kind}" src="${asset("adornos", pin.id)}" alt="" draggable="false" style="--pinx:${L.pinX}px;--pinr:${L.pinRot}deg;--pins:${PIN_SCALE[pin.kind]};--pinaspect:${ratioOf("adornos", pin.id)}">`
    : "";
  const badges = [
    item.hidden ? `<span class="mrp-badge mrp-badge-hidden"><i class="fa-solid fa-eye-slash"></i> ${t("hiddenBadge")}</span>` : "",
    item.owner ? `<span class="mrp-badge mrp-badge-private"><i class="fa-solid fa-lock"></i> ${t("privateBadge")}${game.user.isGM ? ` · ${esc(game.users.get(item.owner)?.name ?? "")}` : ""}</span>` : "",
  ].join("");
  const label = esc(item.title || item.text || ref?.title || t(item.type)).slice(0, 80);
  const html = `<div class="mrp-item mrp-t-${item.type} ${item.hidden ? "mrp-hidden" : ""} ${item.type === "mark" && TABLES.mark.get(item.kind)?.multiply ? "mrp-multiply" : ""}" data-id="${id}" data-type="${item.type}" data-pinx="${L.pinX}" data-rot="${L.rot}" tabindex="0" role="group" aria-label="${label}"
    style="left:${item.x}px;top:${item.y}px;width:${w}px;z-index:${item.z};--w:${w}px">
    <div class="mrp-lift" style="transform:rotate(${L.rot}deg) skewX(${L.skew}deg)">${inner(id, item, ref, L)}${pinHTML}</div>
    <span class="mrp-handle" title="${t("rotation")}"></span>${badges}</div>`;
  return { html, sig: `${JSON.stringify(item)}|${ref?.sig ?? ""}|${game.user.isGM}` };
}

export const hashOf = hash;
