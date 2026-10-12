/**
 * La pizarra: una hoja de JournalEntry (ApplicationV2) con un lienzo que se desplaza y se acerca.
 *
 * Trabajo en común sin pisarse:
 *  - Cada pieza y cada hilo se guardan bajo su propia clave, así que dos personas que mueven cosas distintas
 *    escriben en rutas distintas. Quien no es propietaria del diario envía sus operaciones a la Guardiana
 *    conectada, que las valida con `planOps` y las aplica.
 *  - Mientras alguien arrastra una pieza, los demás la ven moverse en directo y no pueden cogerla (mensaje efímero).
 *  - Los documentos colgados respetan los permisos de cada persona (ver refs.mjs).
 */
import { ID, FLAG, BOARD, BACKGROUNDS, PAPERS, MASKS, PINS, STAMPS, MARKS, FRAMES, NOTE_COLORS, THREAD_COLORS, THREAD_STYLES, TABLES, planOps, look, asset } from "./rules.mjs";
import { t, esc, uid, MANIFEST } from "./util.mjs";
import { renderItem, visibleTo, widthOf } from "./items.mjs";

const SOCKET = `module.${ID}`;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const LIVE_MS = 4000;
const FORMATS = { tall: 1.25, square: 1, wide: 0.7, strip: 0.35 };
const boards = () => [...foundry.applications.instances.values()].filter((app) => app instanceof BoardSheet);
const stored = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(`${ID}.${key}`)) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key, value) => {
  try {
    localStorage.setItem(`${ID}.${key}`, JSON.stringify(value));
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
};

/* -------------------------------- Operaciones y socket -------------------------------- */

export function boardData(doc) {
  return doc.getFlag(ID, "board") ?? { items: {}, links: {}, background: "corcho-claro" };
}

export async function applyOps(doc, ops, ctx) {
  const plan = planOps(boardData(doc), ops, ctx);
  if (Object.keys(plan.update).length) await doc.update(plan.update);
}

export async function sendOps(doc, ops) {
  const ctx = { isGM: game.user.isGM, userId: game.user.id };
  planOps(boardData(doc), ops, ctx); // falla pronto y con el motivo, antes de salir
  if (doc.isOwner) return applyOps(doc, ops, ctx);
  if (!game.users.activeGM) throw Error(t("needGM"));
  game.socket.emit(SOCKET, { action: "ops", docId: doc.id, ops });
}

export function registerSocket() {
  game.socket.on(SOCKET, async (message, senderId) => {
    if (message?.action === "live") return boards().forEach((app) => app.onLive(message, senderId));
    if (message?.action === "error" && message.userId === game.user.id) return ui.notifications.warn(message.error);
    if (message?.action !== "ops" || game.users.activeGM?.id !== game.user.id) return;
    const user = game.users.get(senderId);
    const doc = game.journal.get(message.docId);
    try {
      if (!user || !doc?.getFlag(ID, "board") || !doc.testUserPermission(user, "OBSERVER")) throw Error(t("cannotOpen"));
      await applyOps(doc, message.ops, { isGM: user.isGM, userId: user.id });
    } catch (error) {
      game.socket.emit(SOCKET, { action: "error", userId: senderId, error: error.message });
    }
  });
  let pending;
  const refreshAll = () => {
    clearTimeout(pending);
    pending = setTimeout(() => boards().forEach((app) => app.refresh()), 120);
  };
  for (const hook of ["updateJournalEntry", "updateJournalEntryPage", "createJournalEntryPage", "deleteJournalEntryPage", "deleteJournalEntry", "updateActor", "updateScene", "updateItem"])
    Hooks.on(hook, refreshAll);
}

/* -------------------------------- Formularios -------------------------------- */

const choice = (name, table, value, { auto = false, none = false } = {}) => {
  const entry = (id, label, thumb) =>
    `<label class="mrp-choice"><input type="radio" name="${name}" value="${id}" ${id === value ? "checked" : ""}><span class="mrp-thumb">${thumb}</span><em>${esc(label)}</em></label>`;
  const rows = [];
  if (auto) rows.push(entry("auto", t("auto"), `<i class="fa-solid fa-wand-magic-sparkles"></i>`));
  if (none) rows.push(entry("none", t("none"), `<i class="fa-solid fa-ban"></i>`));
  let group = null;
  for (const e of table) {
    if (e.group && e.group !== group) {
      group = e.group;
      rows.push(`<h5 class="mrp-group">${esc(group)}</h5>`);
    }
    const thumb = e.folder === "bordes" ? `<img src="${asset(e.folder, e.id)}" alt="" class="mrp-maskthumb">` : `<img src="${asset(e.folder, e.id)}" alt="" loading="lazy">`;
    rows.push(entry(e.id, e.name, thumb));
  }
  return `<div class="mrp-choices">${rows.join("")}</div>`;
};
const field = (label, control) => `<div class="form-group stacked"><label>${label}</label><div class="form-fields">${control}</div></div>`;
const pinChoice = (value) => field(t("decoration"), choice("pin", PINS, value ?? "auto", { auto: true, none: true }));
const rotation = (value) => field(t("rotation"), `<input type="range" name="rot" min="-20" max="20" step="1" value="${value ?? 0}">`);

function formHTML(type, item) {
  const parts = [];
  if (type === "note") {
    const swatches = NOTE_COLORS.map((c) => `<label class="mrp-choice"><input type="radio" name="color" value="${c}" ${c === item.color ? "checked" : ""}><span class="mrp-thumb mrp-note-${c}"></span></label>`).join("");
    parts.push(field(t("text"), `<textarea name="text" rows="4" autofocus>${esc(item.text)}</textarea>`), field(t("color"), `<div class="mrp-choices mrp-swatches">${swatches}</div>`), pinChoice(item.pin));
  } else if (type === "clipping") {
    const ratio = item.ratio ?? 1.25;
    const fmt = Object.entries(FORMATS).reduce((best, [k, v]) => (Math.abs(v - ratio) < Math.abs(FORMATS[best] - ratio) ? k : best), "tall");
    const formats = Object.keys(FORMATS).map((k) => `<option value="${FORMATS[k]}" ${k === fmt ? "selected" : ""}>${t(`format${k[0].toUpperCase()}${k.slice(1)}`)}</option>`).join("");
    parts.push(
      field(t("headline"), `<input type="text" name="title" value="${esc(item.title)}" maxlength="120">`),
      field(t("body"), `<textarea name="text" rows="5">${esc(item.text)}</textarea>`),
      field(t("paper"), choice("paper", PAPERS, item.paper)),
      field(t("shape"), choice("mask", MASKS, item.mask ?? "auto", { auto: true, none: true })),
      field(t("format"), `<select name="ratio">${formats}</select>`),
      pinChoice(item.pin),
    );
  } else if (type === "photo") {
    parts.push(
      field(t("image"), `<input type="text" name="src" value="${esc(item.src)}" required><button type="button" class="mrp-browse"><i class="fa-solid fa-file-image"></i> ${t("browse")}</button>`),
      field(t("caption"), `<input type="text" name="text" value="${esc(item.text)}" maxlength="120">`),
      field(t("frame"), choice("frame", FRAMES, item.frame)),
      pinChoice(item.pin),
    );
  } else if (type === "stamp") {
    parts.push(field(t("text"), `<input type="text" name="text" value="${esc(item.text)}" maxlength="60" autofocus>`), field(t("stamp"), choice("kind", STAMPS, item.kind)));
  } else if (type === "mark") {
    parts.push(field(t("mark"), choice("kind", MARKS, item.kind)));
  } else {
    if (type === "entity") parts.push(field(t("frame"), choice("frame", FRAMES, item.frame)));
    if (type === "journal") parts.push(field(t("format"), `<select name="ratio">${Object.entries(FORMATS).map(([k, v]) => `<option value="${v}" ${v === (item.ratio ?? 1.25) ? "selected" : ""}>${t(`format${k[0].toUpperCase()}${k.slice(1)}`)}</option>`).join("")}</select>`), field(t("shape"), choice("mask", MASKS, item.mask ?? "auto", { auto: true, none: true })));
    parts.push(pinChoice(item.pin));
  }
  if (type !== "mark") parts.push(rotation(item.rot));
  parts.push(
    `<div class="form-group"><label class="checkbox"><input type="checkbox" name="private" ${item.owner ? "checked" : ""}> ${t("makePrivate")}</label></div>`,
    game.user.isGM ? `<div class="form-group"><label class="checkbox"><input type="checkbox" name="hidden" ${item.hidden ? "checked" : ""}> ${t("hide")}</label></div>` : "",
  );
  return `<div class="mrp-form">${parts.join("")}</div>`;
}

/** Abre el formulario de una pieza; devuelve los campos listos para `planOps` o null si se cancela. */
async function askItem(type, item, title) {
  const data = await foundry.applications.api.DialogV2.input({
    window: { title, icon: "fa-solid fa-thumbtack" },
    position: { width: 560 },
    content: formHTML(type, item),
    ok: { label: t("save"), icon: "fa-solid fa-check" },
    rejectClose: false,
    render: (event, dialog) => {
      dialog.element.querySelector(".mrp-browse")?.addEventListener("click", () => {
        const input = dialog.element.querySelector("[name=src]");
        new foundry.applications.apps.FilePicker.implementation({ type: "image", current: input.value, callback: (path) => (input.value = path) }).render(true);
      });
    },
  });
  if (!data) return null;
  const out = { ...data };
  if ("rot" in out) out.rot = Number(out.rot);
  if ("ratio" in out) out.ratio = Number(out.ratio);
  out.owner = out.private ? game.user.id : "";
  delete out.private;
  if (!game.user.isGM) delete out.hidden;
  else out.hidden = Boolean(out.hidden);
  return out;
}

/** Lista de documentos que esta persona puede colgar, para el selector «Colgar un documento». */
function documentOptions() {
  const readable = (doc) => game.user.isGM || doc.testUserPermission(game.user, "OBSERVER");
  const opt = (value, label) => `<option value="${value}">${esc(label)}</option>`;
  const journals = game.journal.filter((j) => readable(j) && !j.getFlag(ID, "board")).flatMap((j) => [opt(j.uuid, `${j.name} (${t("wholeEntry")})`), ...j.pages.filter(readable).map((p) => opt(p.uuid, `${j.name} › ${p.name}`))]);
  const group = (label, list) => (list.length ? `<optgroup label="${t(label)}">${list.join("")}</optgroup>` : "");
  return [
    group("journals", journals),
    group("actors", game.actors.filter(readable).map((a) => opt(a.uuid, a.name))),
    ...(game.user.isGM ? [group("scenes", game.scenes.map((s) => opt(s.uuid, s.name)))] : []),
    group("items", game.items.filter(readable).map((i) => opt(i.uuid, i.name))),
  ].join("");
}

/** Reduce el texto de una pieza hasta que cabe en su zona segura. */
function fitText(el) {
  for (const box of el.querySelectorAll(".mrp-text")) {
    let size = 1;
    while ((box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1) && size > 0.45) {
      size -= 0.05;
      box.style.fontSize = `${size.toFixed(2)}em`;
    }
  }
}

/* -------------------------------- La hoja -------------------------------- */

export class BoardSheet extends foundry.applications.api.DocumentSheetV2 {
  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["mrp-window"],
    position: { width: 1180, height: 760 },
    window: { resizable: true, icon: "fa-solid fa-thumbtack", contentClasses: ["mrp-content"] },
  };

  #view = { x: 0, y: 0, k: 0.7 };
  #viewLoaded = false;
  #sigs = new Map();
  #live = new Map();
  #selected = null;
  #threadMode = false;
  #threadFrom = null;
  #threadStyle = { color: "rojo", style: "solido" };
  #first = true;
  #root = null;
  #saveTimer = null;
  #trash = [];

  constructor(options = {}) {
    const saved = stored(`win.${options.document?.id}`, {});
    super({ ...options, position: { ...options.position, ...saved } });
  }

  get title() {
    return this.document.name;
  }
  get board() {
    return boardData(this.document);
  }
  get canEdit() {
    return this.document.testUserPermission(game.user, "OBSERVER") && (game.user.isGM || !this.board.locked);
  }

  _canRender(options) {
    if (!this.document.testUserPermission(game.user, "OBSERVER")) throw Error(t("cannotOpen"));
    return super._canRender(options);
  }

  _onPosition(position) {
    super._onPosition?.(position);
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => store(`win.${this.document.id}`, { left: position.left, top: position.top, width: position.width, height: position.height }), 300);
  }

  _onClose(options) {
    super._onClose(options);
    store(`view.${this.document.id}.${game.user.id}`, this.#view);
    this.#root = null;
    this.#sigs.clear();
    this.#first = true;
    this.#viewLoaded = false;
  }

  async _renderHTML() {
    return null;
  }

  /** La vista inicial se calcula con la ventana ya en pantalla (antes no tiene tamaño). */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.#viewLoaded) return;
    this.#viewLoaded = true;
    const viewport = this.#root.querySelector(".mrp-viewport");
    const observer = new ResizeObserver(() => {
      if (viewport.clientWidth < 200 || viewport.clientHeight < 200) return;
      observer.disconnect();
      const saved = stored(`view.${this.document.id}.${game.user.id}`, null);
      if (saved) {
        this.#view = saved;
        this.#applyView();
      } else this.#fit();
    });
    observer.observe(viewport);
  }

  _replaceHTML(result, content) {
    if (!this.#root?.isConnected || !content.contains(this.#root)) this.#build(content);
    this.refresh();
  }

  /* ---------- construcción ---------- */

  #build(content) {
    const tool = (name, icon, label) => `<button type="button" data-tool="${name}" title="${label}" aria-label="${label}"><i class="${icon}"></i></button>`;
    content.innerHTML = `<div class="mrp-root" tabindex="-1">
      <nav class="mrp-tools" aria-label="${t("title")}">
        ${tool("note", "fa-solid fa-note-sticky", t("note"))}${tool("clipping", "fa-regular fa-newspaper", t("clipping"))}${tool("photo", "fa-regular fa-image", t("photo"))}
        ${tool("doc", "fa-regular fa-file-lines", t("journal"))}${tool("stamp", "fa-solid fa-stamp", t("stamp"))}${tool("mark", "fa-solid fa-pen-nib", t("mark"))}
        <hr>${tool("thread", "fa-solid fa-bezier-curve", t("thread"))}${tool("bg", "fa-solid fa-palette", t("background"))}
        ${game.user.isGM ? tool("lock", "fa-solid fa-lock-open", t("lock")) : ""}
        <hr>${tool("in", "fa-solid fa-magnifying-glass-plus", t("zoomIn"))}${tool("out", "fa-solid fa-magnifying-glass-minus", t("zoomOut"))}${tool("fit", "fa-solid fa-expand", t("fit"))}
      </nav>
      <div class="mrp-viewport"><div class="mrp-world" style="width:${BOARD.width}px;height:${BOARD.height}px">
        <div class="mrp-surface"></div><svg class="mrp-threads" width="${BOARD.width}" height="${BOARD.height}" aria-hidden="true"></svg><div class="mrp-items"></div></div></div>
      <div class="mrp-hud" role="status"></div><div class="mrp-hint">${t("empty")}</div></div>`;
    this.#root = content.querySelector(".mrp-root");
    this.#listen();
  }

  #listen() {
    const root = this.#root;
    const viewport = root.querySelector(".mrp-viewport");
    root.querySelector(".mrp-tools").addEventListener("click", (event) => {
      const tool = event.target.closest("[data-tool]")?.dataset.tool;
      if (tool) this.#tool(tool);
    });
    viewport.addEventListener("wheel", (event) => this.#wheel(event), { passive: false });
    viewport.addEventListener("pointerdown", (event) => this.#down(event));
    viewport.addEventListener("dblclick", (event) => {
      const id = event.target.closest(".mrp-item")?.dataset.id;
      if (id) this.#activate(id);
    });
    viewport.addEventListener("contextmenu", (event) => this.#contextmenu(event));
    viewport.addEventListener("dragover", (event) => event.preventDefault());
    viewport.addEventListener("drop", (event) => this.#drop(event));
    root.addEventListener("keydown", (event) => this.#key(event));
    // las imágenes cambian la altura de las piezas: los hilos se recolocan al cargarlas
    root.querySelector(".mrp-items").addEventListener("load", () => this.#drawThreads(), true);
  }

  /* ---------- vista (desplazar y acercar) ---------- */

  #applyView() {
    const { x, y, k } = this.#view;
    this.#root.querySelector(".mrp-world").style.transform = `translate(${x}px,${y}px) scale(${k})`;
  }

  #toWorld(clientX, clientY) {
    const rect = this.#root.querySelector(".mrp-viewport").getBoundingClientRect();
    return { x: (clientX - rect.left - this.#view.x) / this.#view.k, y: (clientY - rect.top - this.#view.y) / this.#view.k };
  }

  #zoomAt(factor, clientX, clientY) {
    const rect = this.#root.querySelector(".mrp-viewport").getBoundingClientRect();
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.#view.k * factor));
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    this.#view = { k, x: px - ((px - this.#view.x) / this.#view.k) * k, y: py - ((py - this.#view.y) / this.#view.k) * k };
    this.#applyView();
  }

  #wheel(event) {
    event.preventDefault();
    this.#zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX, event.clientY);
  }

  #fit() {
    const rect = this.#root.querySelector(".mrp-viewport").getBoundingClientRect();
    const els = [...this.#root.querySelectorAll(".mrp-item")];
    let box = { x1: 0, y1: 0, x2: BOARD.width, y2: BOARD.height };
    if (els.length) {
      box = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
      for (const el of els) {
        box.x1 = Math.min(box.x1, el.offsetLeft);
        box.y1 = Math.min(box.y1, el.offsetTop);
        box.x2 = Math.max(box.x2, el.offsetLeft + el.offsetWidth);
        box.y2 = Math.max(box.y2, el.offsetTop + el.offsetHeight);
      }
    }
    const pad = 80;
    const k = Math.min(1.1, Math.max(MIN_ZOOM, Math.min(rect.width / (box.x2 - box.x1 + pad * 2), rect.height / (box.y2 - box.y1 + pad * 2))));
    this.#view = { k, x: rect.width / 2 - ((box.x1 + box.x2) / 2) * k, y: rect.height / 2 - ((box.y1 + box.y2) / 2) * k };
    this.#applyView();
  }

  /* ---------- pintado y reconciliación ---------- */

  refresh() {
    if (!this.#root) return;
    const board = this.board;
    const surface = this.#root.querySelector(".mrp-surface");
    const bg = TABLES.background.get(board.background) ?? BACKGROUNDS[0];
    surface.style.backgroundImage = `url(${asset(bg.folder, bg.id)})`;
    const tiled = MANIFEST[`fondos/${bg.id}`]?.mode !== "cover" && bg.size;
    surface.style.backgroundSize = tiled ? `${bg.size}px` : "cover";
    surface.style.backgroundRepeat = tiled ? "repeat" : "no-repeat";
    this.#root.classList.toggle("mrp-readonly", !this.canEdit);
    this.#root.querySelector("[data-tool=lock] i")?.setAttribute("class", `fa-solid ${board.locked ? "fa-lock" : "fa-lock-open"}`);
    const container = this.#root.querySelector(".mrp-items");
    const seen = new Set();
    for (const [id, item] of Object.entries(board.items ?? {})) {
      if (!visibleTo(item)) continue;
      seen.add(id);
      const { html, sig } = renderItem(id, item);
      const old = container.querySelector(`[data-id="${id}"]`);
      if (old && this.#sigs.get(id) === sig) continue;
      const el = document.createRange().createContextualFragment(html).firstElementChild;
      if (!old && !this.#first) el.classList.add("mrp-in");
      if (id === this.#selected) el.classList.add("mrp-selected");
      if (old) old.replaceWith(el);
      else container.append(el);
      fitText(el);
      this.#sigs.set(id, sig);
    }
    for (const el of container.querySelectorAll(".mrp-item")) if (!seen.has(el.dataset.id)) el.remove();
    for (const id of [...this.#sigs.keys()]) if (!seen.has(id)) this.#sigs.delete(id);
    this.#root.querySelector(".mrp-hint").hidden = seen.size > 0;
    this.#drawThreads();
    this.#first = false;
    this.#hud();
  }

  #hud() {
    const hud = this.#root.querySelector(".mrp-hud");
    let text = "";
    if (this.board.locked) text = `<i class="fa-solid fa-lock"></i> ${t("locked")}`;
    if (this.#threadMode) {
      const swatches = Object.entries(THREAD_COLORS).map(([name, hex]) => `<button type="button" class="mrp-dot ${name === this.#threadStyle.color ? "on" : ""}" data-color="${name}" style="--c:${hex}" title="${name}" aria-label="${name}"></button>`).join("");
      const styles = THREAD_STYLES.map((s) => `<button type="button" class="mrp-style ${s === this.#threadStyle.style ? "on" : ""}" data-style="${s}">${t(`threadStyle${s === "solido" ? "Solid" : s === "punteado" ? "Dotted" : "Dashed"}`)}</button>`).join("");
      text = `<span>${t(this.#threadFrom ? "threadPickSecond" : "threadPickFirst")}</span>${swatches}${styles}`;
    }
    hud.innerHTML = text;
    hud.classList.toggle("on", Boolean(text));
    hud.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => ((this.#threadStyle.color = b.dataset.color), this.#hud())));
    hud.querySelectorAll("[data-style]").forEach((b) => b.addEventListener("click", () => ((this.#threadStyle.style = b.dataset.style), this.#hud())));
    this.#root.classList.toggle("mrp-threading", this.#threadMode);
    this.#root.querySelector("[data-tool=thread]")?.classList.toggle("active", this.#threadMode);
  }

  /* ---------- hilos ---------- */

  #anchor(el) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const rot = (Number(el.dataset.rot) * Math.PI) / 180;
    const ox = w * Number(el.dataset.fx) + Number(el.dataset.pinx) - w / 2;
    const oy = Number(el.dataset.pint) - h / 2;
    return { x: el.offsetLeft + w / 2 + ox * Math.cos(rot) - oy * Math.sin(rot), y: el.offsetTop + h / 2 + ox * Math.sin(rot) + oy * Math.cos(rot) };
  }

  #drawThreads() {
    if (!this.#root) return;
    const svg = this.#root.querySelector(".mrp-threads");
    const links = this.board.links ?? {};
    const parts = [];
    for (const [id, link] of Object.entries(links)) {
      const a = this.#root.querySelector(`.mrp-item[data-id="${link.from}"]`);
      const b = this.#root.querySelector(`.mrp-item[data-id="${link.to}"]`);
      if (!a || !b) continue;
      const p = this.#anchor(a);
      const q = this.#anchor(b);
      const dist = Math.hypot(q.x - p.x, q.y - p.y);
      const sag = Math.min(140, 18 + dist * 0.1);
      const cx = (p.x + q.x) / 2;
      const cy = (p.y + q.y) / 2 + sag * 2;
      const d = `M${p.x},${p.y} Q${cx},${cy} ${q.x},${q.y}`;
      const dash = link.style === "punteado" ? "2 9" : link.style === "discontinuo" ? "16 10" : "";
      const hex = THREAD_COLORS[link.color] ?? THREAD_COLORS.rojo;
      const mx = (p.x + 2 * cx + q.x) / 4;
      const my = (p.y + 2 * cy + q.y) / 4;
      parts.push(`<g class="mrp-thread" data-link="${id}"><path class="mrp-thread-shadow" d="${d}" transform="translate(3,5)"/><path class="mrp-thread-line" d="${d}" stroke="${hex}" ${dash ? `stroke-dasharray="${dash}"` : ""}/><path class="mrp-thread-hit" d="${d}"/>${link.label ? `<text x="${mx}" y="${my - 8}" text-anchor="middle">${esc(link.label)}</text>` : ""}</g>`);
    }
    svg.innerHTML = parts.join("");
  }

  /* ---------- interacción con el puntero ---------- */

  #down(event) {
    if (event.button === 2) return;
    this.#closeMenu();
    this.#root.focus({ preventScroll: true });
    const itemEl = event.target.closest(".mrp-item");
    const threadEl = event.target.closest(".mrp-thread");
    if (threadEl && !itemEl && event.button === 0) return this.#threadMenu(threadEl.dataset.link, event);
    if (itemEl) {
      const id = itemEl.dataset.id;
      if (this.#threadMode) return this.#threadPick(id);
      this.#select(id);
      if (!this.canEdit) return;
      if (event.target.closest(".mrp-handle")) return this.#startResize(event, itemEl);
      return this.#startDrag(event, itemEl);
    }
    this.#select(null);
    this.#startPan(event);
  }

  #select(id) {
    this.#selected = id;
    this.#root.querySelectorAll(".mrp-selected").forEach((el) => el.classList.remove("mrp-selected"));
    if (id) this.#root.querySelector(`.mrp-item[data-id="${id}"]`)?.classList.add("mrp-selected");
  }

  #track(event, onMove, onUp) {
    const target = event.currentTarget;
    const move = (e) => onMove(e);
    const up = (e) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onUp(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    event.preventDefault();
    return target;
  }

  #startPan(event) {
    const start = { x: event.clientX, y: event.clientY, vx: this.#view.x, vy: this.#view.y };
    this.#root.classList.add("mrp-panning");
    this.#track(event, (e) => {
      this.#view.x = start.vx + e.clientX - start.x;
      this.#view.y = start.vy + e.clientY - start.y;
      this.#applyView();
    }, () => this.#root.classList.remove("mrp-panning"));
  }

  #startDrag(event, el) {
    const id = el.dataset.id;
    const lock = this.#live.get(id);
    if (lock && lock.until > Date.now() && lock.user !== game.user.id) return ui.notifications.info(`${game.users.get(lock.user)?.name ?? "?"}…`);
    const item = this.board.items[id];
    const start = { x: event.clientX, y: event.clientY, ox: item.x, oy: item.y };
    let moved = false;
    let last = 0;
    this.#track(event, (e) => {
      const dx = (e.clientX - start.x) / this.#view.k;
      const dy = (e.clientY - start.y) / this.#view.k;
      if (!moved && Math.hypot(dx, dy) * this.#view.k < 3) return;
      moved = true;
      const x = Math.max(0, Math.min(BOARD.width - 40, start.ox + dx));
      const y = Math.max(0, Math.min(BOARD.height - 40, start.oy + dy));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.classList.add("mrp-dragging");
      this.#drawThreads();
      if (Date.now() - last > 70) {
        last = Date.now();
        game.socket.emit(SOCKET, { action: "live", docId: this.document.id, id, x, y });
      }
    }, () => {
      el.classList.remove("mrp-dragging");
      if (!moved) return;
      const z = Math.max(1, ...Object.values(this.board.items).map((i) => i.z)) + 1;
      this.#commit([{ op: "set", kind: "items", id, data: { x: Math.round(parseFloat(el.style.left)), y: Math.round(parseFloat(el.style.top)), z } }]);
    });
  }

  #startResize(event, el) {
    const id = el.dataset.id;
    const startW = el.offsetWidth;
    const start = event.clientX;
    let w = startW;
    this.#track(event, (e) => {
      w = Math.max(60, Math.min(1100, startW + (e.clientX - start) / this.#view.k));
      el.style.width = `${w}px`;
      el.style.setProperty("--w", `${w}px`);
      this.#drawThreads();
    }, () => this.#commit([{ op: "set", kind: "items", id, data: { w: Math.round(w) } }]));
  }

  onLive(message, senderId) {
    if (message.docId !== this.document.id || senderId === game.user.id || !this.#root) return;
    const el = this.#root.querySelector(`.mrp-item[data-id="${message.id}"]`);
    if (!el) return;
    this.#live.set(message.id, { user: senderId, until: Date.now() + LIVE_MS });
    el.style.left = `${message.x}px`;
    el.style.top = `${message.y}px`;
    el.classList.add("mrp-remote");
    clearTimeout(el._mrpLive);
    el._mrpLive = setTimeout(() => el.classList.remove("mrp-remote"), LIVE_MS);
    this.#drawThreads();
  }

  async #commit(ops) {
    try {
      await sendOps(this.document, ops);
    } catch (error) {
      ui.notifications.warn(error.message);
      this.#sigs.clear();
      this.refresh();
    }
  }

  /* ---------- herramientas ---------- */

  #tool(name) {
    if (name === "in" || name === "out") {
      const rect = this.#root.querySelector(".mrp-viewport").getBoundingClientRect();
      return this.#zoomAt(name === "in" ? 1.25 : 0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    if (name === "fit") return this.#fit();
    if (name === "thread") {
      this.#threadMode = !this.#threadMode;
      this.#threadFrom = null;
      this.#root.querySelectorAll(".mrp-threadsrc").forEach((el) => el.classList.remove("mrp-threadsrc"));
      return this.#hud();
    }
    if (name === "lock") return this.#commit([{ op: "set", kind: "settings", id: uid(), data: { locked: !this.board.locked } }]);
    if (!this.canEdit) return ui.notifications.warn(t("locked"));
    if (name === "bg") return this.#pickBackground();
    if (name === "doc") return this.#pickDocument();
    return this.#create(name);
  }

  #center() {
    const rect = this.#root.querySelector(".mrp-viewport").getBoundingClientRect();
    const p = this.#toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { x: p.x + (Math.random() - 0.5) * 120, y: p.y + (Math.random() - 0.5) * 80 };
  }

  async #create(type, at) {
    const base = {
      note: { type: "note", text: "", color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)] },
      clipping: { type: "clipping", title: "", text: "", paper: "periodico-1" },
      photo: { type: "photo", src: "", text: "", frame: "polaroid" },
      stamp: { type: "stamp", kind: "marco-rect-rojo", text: "" },
      mark: { type: "mark", kind: "tachado-1" },
    }[type];
    base.rot = Math.round((Math.random() * 2 - 1) * 5);
    const data = await askItem(type, base, t(type));
    if (!data) return;
    const point = at ?? this.#center();
    const z = Math.max(1, ...Object.values(this.board.items ?? {}).map((i) => i.z)) + 1;
    const w = widthOf({ ...base, ...data });
    await this.#commit([{ op: "set", kind: "items", id: uid(), data: { ...base, ...data, x: Math.round(point.x - w / 2), y: Math.round(point.y - w / 2), z } }]);
  }

  async #pickBackground() {
    const data = await foundry.applications.api.DialogV2.input({
      window: { title: t("background"), icon: "fa-solid fa-palette" },
      position: { width: 620 },
      content: `<div class="mrp-form">${choice("background", BACKGROUNDS.map((b) => ({ ...b, group: t(`group${{ Clásicos: "Classic", Época: "Period", "Moderno y futuro": "Modern" }[b.group]}`) })), this.board.background ?? "corcho-claro")}</div>`,
      ok: { label: t("save"), icon: "fa-solid fa-check" },
      rejectClose: false,
    });
    if (data?.background) this.#commit([{ op: "set", kind: "settings", id: uid(), data: { background: data.background } }]);
  }

  async #pickDocument() {
    const data = await foundry.applications.api.DialogV2.input({
      window: { title: t("pickDocument"), icon: "fa-regular fa-file-lines" },
      position: { width: 520 },
      content: `<div class="mrp-form"><p class="hint">${t("pickDocumentHint")}</p><div class="form-group"><select name="uuid">${documentOptions()}</select></div></div>`,
      ok: { label: t("add"), icon: "fa-solid fa-thumbtack" },
      rejectClose: false,
    });
    if (data?.uuid) this.#addRef(data.uuid, this.#center());
  }

  #addRef(uuid, point) {
    const match = /^(JournalEntry|Actor|Scene|Item|RollTable)\./.exec(uuid);
    if (!match) return ui.notifications.warn(t("dropUnsupported"));
    const type = match[1] === "JournalEntry" ? "journal" : "entity";
    const z = Math.max(1, ...Object.values(this.board.items ?? {}).map((i) => i.z)) + 1;
    const w = widthOf({ type });
    return this.#commit([{ op: "set", kind: "items", id: uid(), data: { type, uuid, x: Math.round(point.x - w / 2), y: Math.round(point.y - w / 2), z } }]);
  }

  #drop(event) {
    event.preventDefault();
    if (!this.canEdit) return;
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const uuid = data?.uuid;
    if (!uuid) return ui.notifications.warn(t("dropUnsupported"));
    if (uuid.startsWith("Compendium.")) return ui.notifications.warn(t("dropCompendium"));
    return this.#addRef(uuid, this.#toWorld(event.clientX, event.clientY));
  }

  /* ---------- hilos: elegir piezas ---------- */

  #threadPick(id) {
    if (!this.canEdit) return ui.notifications.warn(t("locked"));
    if (!this.#threadFrom) {
      this.#threadFrom = id;
      this.#root.querySelector(`.mrp-item[data-id="${id}"]`)?.classList.add("mrp-threadsrc");
      return this.#hud();
    }
    if (id === this.#threadFrom) return;
    const from = this.#threadFrom;
    this.#threadFrom = null;
    this.#root.querySelectorAll(".mrp-threadsrc").forEach((el) => el.classList.remove("mrp-threadsrc"));
    this.#hud();
    return this.#commit([{ op: "set", kind: "links", id: uid(), data: { from, to: id, ...this.#threadStyle } }]);
  }

  /* ---------- menús ---------- */

  #closeMenu() {
    this.#root?.querySelectorAll(".mrp-menu").forEach((m) => m.remove());
  }

  #menu(event, entries) {
    this.#closeMenu();
    const rect = this.#root.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.className = "mrp-menu";
    menu.setAttribute("role", "menu");
    menu.style.left = `${Math.min(event.clientX - rect.left, rect.width - 250)}px`;
    menu.style.top = `${Math.min(event.clientY - rect.top, rect.height - entries.length * 34 - 12)}px`;
    for (const entry of entries.filter(Boolean)) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.innerHTML = `<i class="${entry.icon}"></i> ${entry.label}`;
      if (entry.danger) button.classList.add("danger");
      button.addEventListener("click", () => {
        this.#closeMenu();
        entry.fn();
      });
      menu.append(button);
    }
    this.#root.append(menu);
    menu.querySelector("button")?.focus();
  }

  #contextmenu(event) {
    event.preventDefault();
    const itemEl = event.target.closest(".mrp-item");
    const threadEl = event.target.closest(".mrp-thread");
    if (itemEl) return this.#itemMenu(itemEl.dataset.id, event);
    if (threadEl) return this.#threadMenu(threadEl.dataset.link, event);
  }

  #itemMenu(id, event) {
    this.#select(id);
    const item = this.board.items[id];
    if (!item) return;
    const edit = this.canEdit;
    const isRef = ["journal", "entity"].includes(item.type);
    this.#menu(event, [
      isRef && { icon: "fa-regular fa-folder-open", label: t("openDoc"), fn: () => this.#openRef(item) },
      edit && { icon: "fa-solid fa-pen", label: t("edit"), fn: () => this.#edit(id) },
      edit && { icon: "fa-solid fa-bezier-curve", label: t("threadFrom"), fn: () => ((this.#threadMode = true), (this.#threadFrom = id), this.#root.querySelector(`.mrp-item[data-id="${id}"]`)?.classList.add("mrp-threadsrc"), this.#hud()) },
      edit && { icon: "fa-regular fa-clone", label: t("duplicate"), fn: () => this.#duplicate(id) },
      edit && { icon: "fa-solid fa-arrow-up-long", label: t("front"), fn: () => this.#commit([{ op: "set", kind: "items", id, data: { z: Math.max(...Object.values(this.board.items).map((i) => i.z)) + 1 } }]) },
      edit && { icon: "fa-solid fa-arrow-down-long", label: t("back"), fn: () => this.#commit([{ op: "set", kind: "items", id, data: { z: 0 } }]) },
      game.user.isGM && { icon: item.hidden ? "fa-solid fa-eye" : "fa-solid fa-eye-slash", label: t(item.hidden ? "reveal" : "hide"), fn: () => this.#commit([{ op: "set", kind: "items", id, data: { hidden: !item.hidden } }]) },
      edit && { icon: item.owner ? "fa-solid fa-lock-open" : "fa-solid fa-lock", label: t(item.owner ? "makePublic" : "makePrivate"), fn: () => this.#commit([{ op: "set", kind: "items", id, data: { owner: item.owner ? "" : game.user.id } }]) },
      edit && { icon: "fa-solid fa-trash", label: t("remove"), danger: true, fn: () => this.#remove(id) },
    ]);
  }

  #threadMenu(linkId, event) {
    if (!this.canEdit) return;
    const link = this.board.links?.[linkId];
    if (!link) return;
    this.#menu(event, [
      { icon: "fa-solid fa-pen", label: t("threadEdit"), fn: () => this.#editThread(linkId) },
      { icon: "fa-solid fa-trash", label: t("threadRemove"), danger: true, fn: () => this.#commit([{ op: "remove", kind: "links", id: linkId }]) },
    ]);
  }

  async #editThread(linkId) {
    const link = this.board.links[linkId];
    const colors = Object.entries(THREAD_COLORS).map(([n, hex]) => `<label class="mrp-choice"><input type="radio" name="color" value="${n}" ${n === link.color ? "checked" : ""}><span class="mrp-thumb" style="background:${hex}"></span></label>`).join("");
    const styles = THREAD_STYLES.map((s) => `<option value="${s}" ${s === link.style ? "selected" : ""}>${t(`threadStyle${s === "solido" ? "Solid" : s === "punteado" ? "Dotted" : "Dashed"}`)}</option>`).join("");
    const data = await foundry.applications.api.DialogV2.input({
      window: { title: t("threadEdit"), icon: "fa-solid fa-bezier-curve" },
      position: { width: 420 },
      content: `<div class="mrp-form">${field(t("threadLabel"), `<input type="text" name="label" value="${esc(link.label)}" maxlength="60" autofocus>`)}${field(t("threadColor"), `<div class="mrp-choices mrp-swatches">${colors}</div>`)}${field(t("threadStyleSolid"), `<select name="style">${styles}</select>`)}</div>`,
      ok: { label: t("save"), icon: "fa-solid fa-check" },
      rejectClose: false,
    });
    if (data) this.#commit([{ op: "set", kind: "links", id: linkId, data }]);
  }

  async #edit(id) {
    const item = this.board.items[id];
    const L = look(id, item);
    const data = await askItem(item.type, { ...item, rot: item.rot ?? L.rot }, t(item.type));
    if (data) this.#commit([{ op: "set", kind: "items", id, data }]);
  }

  #activate(id) {
    const item = this.board.items[id];
    if (!item) return;
    if (["journal", "entity"].includes(item.type)) return this.#openRef(item);
    if (this.canEdit && !this.#threadMode) this.#edit(id);
  }

  async #openRef(item) {
    const doc = await fromUuid(item.uuid);
    if (!doc || !(game.user.isGM || doc.testUserPermission(game.user, "OBSERVER"))) return ui.notifications.warn(t("noPermission"));
    if (doc.documentName === "JournalEntryPage") return doc.parent.sheet.render({ force: true, pageId: doc.id });
    return doc.sheet.render({ force: true });
  }

  #duplicate(id) {
    const { z, ...item } = this.board.items[id];
    const top = Math.max(...Object.values(this.board.items).map((i) => i.z)) + 1;
    this.#commit([{ op: "set", kind: "items", id: uid(), data: { ...item, x: item.x + 36, y: item.y + 36, z: top } }]);
  }

  /** Quita una pieza (y sus hilos) sin preguntar; Ctrl/Cmd+Z la devuelve. */
  #remove(id) {
    const item = this.board.items[id];
    if (!item) return;
    const links = Object.entries(this.board.links ?? {}).filter(([, l]) => l.from === id || l.to === id).map(([linkId, l]) => ({ id: linkId, ...l }));
    this.#trash.push({ id, item, links });
    if (this.#trash.length > 25) this.#trash.shift();
    this.#selected = null;
    return this.#commit([{ op: "remove", kind: "items", id }]);
  }

  #undoRemove() {
    const last = this.#trash.pop();
    if (!last) return;
    const { hidden, ...rest } = last.item;
    const data = game.user.isGM ? last.item : rest;
    return this.#commit([
      { op: "set", kind: "items", id: last.id, data },
      ...last.links.filter((l) => this.board.items[l.from] || l.from === last.id).map(({ id, ...link }) => ({ op: "set", kind: "links", id, data: link })),
    ]);
  }

  #key(event) {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
    if (event.key === "Escape") {
      this.#closeMenu();
      if (this.#threadMode) this.#tool("thread");
    } else if ((event.key === "Delete" || event.key === "Backspace") && this.#selected && this.canEdit) {
      event.preventDefault();
      this.#remove(this.#selected);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && this.canEdit) {
      event.preventDefault();
      this.#undoRemove();
    } else if (event.key === "Enter" && event.target.classList.contains("mrp-item")) this.#activate(event.target.dataset.id);
  }
}
