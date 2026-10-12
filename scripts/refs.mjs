/**
 * Resuelve lo que cada persona puede ver de un documento colgado en la pizarra, según sus permisos:
 *  - full:    el contenido (texto o imagen de las páginas que puede leer).
 *  - limited: solo el título; el texto sale censurado.
 *  - none:    una carpeta «reservada» sin nombre.
 * Devuelve también una firma (`sig`) que cambia cuando cambia lo visible, para repintar solo lo necesario.
 */
import { levelOf, plain } from "./util.mjs";

const EXCERPT = 420;
const stamp = (doc) => doc?._stats?.modifiedTime ?? 0;

export function resolveJournal(uuid) {
  const doc = fromUuidSync(uuid, { strict: false });
  if (!doc?.documentName) return { level: "none", missing: !doc, sig: `none:${Boolean(doc)}` };
  const isPage = doc.documentName === "JournalEntryPage";
  const entry = isPage ? doc.parent : doc;
  const pages = isPage ? [doc] : entry.pages.contents.sort((a, b) => a.sort - b.sort);
  const level = isPage ? levelOf(doc) : levelOf(entry);
  const title = isPage ? doc.name : entry.name;
  const readable = pages.filter((page) => levelOf(page) === "full");
  const sig = `${level}|${title}|${readable.map((p) => `${p.id}${stamp(p)}${p.type}`).join()}`;
  if (level === "none") return { level, sig };
  if (level === "limited" || !readable.length) return { level: level === "full" ? "limited" : level, title, sig };
  const image = readable.find((page) => page.type === "image" && page.src);
  const text = readable.filter((page) => page.type === "text").map((page) => plain(page.text?.content)).filter(Boolean).join(" · ");
  if (text) return { level, title, kind: "text", body: text.length > EXCERPT ? `${text.slice(0, EXCERPT).trimEnd()}…` : text, sig };
  if (image) return { level, title, kind: "image", src: image.src, caption: image.image?.caption ?? "", sig };
  return { level, title, kind: "text", body: "", sig };
}

/**
 * Actor, escena, objeto o tabla. Tres casos especiales:
 *  - sin vincular (`uuid` vacío): solo hay un nombre; se pinta con silueta (el master la vincula después).
 *  - desvelada (`reveal`): la Guardiana guardó nombre e imagen para mostrarlos a quien no tiene permiso sobre el documento
 *    (esa persona ni siquiera recibe el documento, por eso hace falta la instantánea).
 */
export function resolveEntity(item) {
  if (!item.uuid) return { level: "pending", title: item.name ?? "", src: item.img || null, sig: `pending|${item.name}|${item.img}` };
  const doc = fromUuidSync(item.uuid, { strict: false });
  const level = doc?.documentName ? levelOf(doc) : "none";
  const reveal = item.reveal;
  if (level === "full") {
    const img = doc.documentName === "Scene" ? (doc.thumb ?? doc.background?.src) : doc.img;
    return { level, title: doc.name, src: img, sig: `${level}|${doc.name}|${img}` };
  }
  if (reveal) return { level: "revealed", title: reveal.name, src: reveal.img || null, sig: `rev|${reveal.name}|${reveal.img}` };
  if (!doc?.documentName) return { level: "none", missing: true, sig: "none:false" };
  if (level === "none") return { level, sig: "none:true" };
  return { level, title: doc.name, src: null, sig: `${level}|${doc.name}` };
}
