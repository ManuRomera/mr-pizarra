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
import { ID, FLAG, BOARD, BACKGROUNDS, PAPERS, MASKS, PINS, STAMPS, MARKS, FRAMES, NOTE_COLORS, THREAD_COLORS, THREAD_STYLES, TABLES, PIN_LAYOUTS, DEFAULT_PIN_PRESET, planOps, look, asset } from "./rules.mjs";
import { t, esc, uid, MANIFEST } from "./util.mjs";
import { renderItem, visibleTo, widthOf, pinElementHTML } from "./items.mjs";

const BLOCKED_PAPERS = new Set(["sobre", "fotocopia"]);
const PIN_COLORS = ["#c0392b", "#2c6fbb", "#2f8f5b", "#e0b020", "#2b2b2b", "#f4f1e8", "#7d4fb5", "#e8742a"];
const DEFAULT_A11Y = { scale: 1, legible: false, contrast: false, calm: false, bigUi: false };
const pickImage = (current = "") => new Promise((resolve) => new foundry.applications.apps.FilePicker.implementation({ type: "image", current, callback: resolve }).render(true));

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
const layoutSelect = (value) => `<select name="pinLayout">${["auto", ...Object.keys(PIN_LAYOUTS)].map((k) => `<option value="${k}" ${k === (value ?? "auto") ? "selected" : ""}>${k === "auto" ? t("auto") : esc(PIN_LAYOUTS[k].name)}</option>`).join("")}</select>`;
const colorFields = (value) => {
  const mode = value && value !== "orig" ? "custom" : (value ?? "");
  return `<select name="pinColorMode"><option value="" ${mode === "" ? "selected" : ""}>${t("pinInherit")}</option><option value="orig" ${mode === "orig" ? "selected" : ""}>${t("pinOriginal")}</option><option value="custom" ${mode === "custom" ? "selected" : ""}>${t("pinCustom")}</option></select><input type="color" name="pinColorCustom" value="${/^#/.test(value ?? "") ? value : "#c0392b"}">`;
};
const pinChoice = (item) => field(t("decoration"), choice("pin", PINS, item.pin ?? "auto", { auto: true, none: true })) + field(t("pinLayout"), layoutSelect(item.pinLayout)) + field(t("pinColor"), colorFields(item.pinColor));
const rotation = (value) => field(t("rotation"), `<input type="range" name="rot" min="-20" max="20" step="1" value="${value ?? 0}">`);

function formHTML(type, item) {
  const parts = [];
  if (type === "note") {
    const swatches = NOTE_COLORS.map((c) => `<label class="mrp-choice"><input type="radio" name="color" value="${c}" ${c === item.color ? "checked" : ""}><span class="mrp-thumb mrp-note-${c}"></span></label>`).join("");
    parts.push(field(t("text"), `<textarea name="text" rows="4" autofocus>${esc(item.text)}</textarea>`), field(t("color"), `<div class="mrp-choices mrp-swatches">${swatches}</div>`), pinChoice(item));
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
      pinChoice(item),
    );
  } else if (type === "photo") {
    parts.push(
      field(t("image"), `<input type="text" name="src" value="${esc(item.src)}" required><button type="button" class="mrp-browse"><i class="fa-solid fa-file-image"></i> ${t("browse")}</button>`),
      field(t("caption"), `<input type="text" name="text" value="${esc(item.text)}" maxlength="120">`),
      field(t("frame"), choice("frame", FRAMES, item.frame)),
      pinChoice(item),
    );
  } else if (type === "stamp") {
    parts.push(field(t("text"), `<input type="text" name="text" value="${esc(item.text)}" maxlength="60" autofocus>`), field(t("stamp"), choice("kind", STAMPS, item.kind)));
  } else if (type === "mark") {
    parts.push(field(t("mark"), choice("kind", MARKS, item.kind)));
  } else {
    if (type === "entity") parts.push(field(t("frame"), choice("frame", FRAMES, item.frame)));
    if (type === "journal") parts.push(field(t("format"), `<select name="ratio">${Object.entries(FORMATS).map(([k, v]) => `<option value="${v}" ${v === (item.ratio ?? 1.25) ? "selected" : ""}>${t(`format${k[0].toUpperCase()}${k.slice(1)}`)}</option>`).join("")}</select>`), field(t("shape"), choice("mask", MASKS, item.mask ?? "auto", { auto: true, none: true })));
    parts.push(pinChoice(item));
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
  if ("pinColorMode" in out) {
    out.pinColor = out.pinColorMode === "custom" ? out.pinColorCustom : out.pinColorMode;
    delete out.pinColorMode;
    delete out.pinColorCustom;
  }
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
  for (const box of el.querySelectorAll(".mrp-text, .mrp-stamptext, .mrp-caption")) {
    // sellos y pies de foto fijan su tamaño en px: se escalan con una variable; el resto con em
    const own = box.classList.contains("mrp-stamptext") || box.classList.contains("mrp-caption");
    const apply = (size) => (own ? box.style.setProperty("--fit", size.toFixed(2)) : (box.style.fontSize = `${size.toFixed(2)}em`));
    let size = 1;
    apply(1);
    while ((box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1) && size > 0.4) {
      size -= 0.05;
      apply(size);
    }
  }
}

/* -------------------------------- Geometría -------------------------------- */

const rad = (deg) => (deg * Math.PI) / 180;
const normDeg = (deg) => ((((deg + 180) % 360) + 360) % 360) - 180;
const rotate = (x, y, deg) => ({ x: x * Math.cos(rad(deg)) - y * Math.sin(rad(deg)), y: x * Math.sin(rad(deg)) + y * Math.cos(rad(deg)) });
/** Esquinas (en el lienzo) de un rectángulo centrado en (cx,cy) y girado `rot` grados. */
const corners = ({ cx, cy, w, h, rot }) =>
  [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => {
    const p = rotate(x, y, rot);
    return { x: cx + p.x, y: cy + p.y };
  });
const aabb = (points) => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
};

/** Envía operaciones en lotes del tamaño que admite `planOps`. */
async function sendChunked(doc, ops) {
  for (let i = 0; i < ops.length; i += BOARD.batch) await sendOps(doc, ops.slice(i, i + BOARD.batch));
}

/* -------------------------------- La hoja -------------------------------- */

const TOOLS = [
  { group: "mode", items: [["select", "fa-solid fa-arrow-pointer", "toolSelect", "V"], ["hand", "fa-regular fa-hand", "toolHand", "H / Espacio"]] },
  { group: "add", items: [["note", "fa-solid fa-note-sticky", "note"], ["clipping", "fa-regular fa-newspaper", "clipping"], ["photo", "fa-regular fa-image", "photo"], ["doc", "fa-regular fa-file-lines", "journal"], ["stamp", "fa-solid fa-stamp", "stamp"], ["mark", "fa-solid fa-pen-nib", "mark"]] },
  { group: "link", items: [["thread", "fa-solid fa-bezier-curve", "thread", "T"]] },
  { group: "board", items: [["bg", "fa-solid fa-palette", "background"]] },
];

export class BoardSheet extends foundry.applications.api.DocumentSheetV2 {
  static DEFAULT_OPTIONS = {
    tag: "div",
    classes: ["mrp-window"],
    position: { width: 1240, height: 800 },
    window: { resizable: true, icon: "fa-solid fa-thumbtack", contentClasses: ["mrp-content"] },
  };

  #view = { x: 0, y: 0, k: 0.7 };
  #viewLoaded = false;
  #sigs = new Map();
  #live = new Map();
  #sel = new Set();
  #mode = "select";
  #space = false;
  #threadMode = false;
  #threadFrom = null;
  #threadStyle = { color: "rojo", style: "solido" };
  #first = true;
  #root = null;
  #saveTimer = null;
  #history = [];
  #preview = new Map();
  #raf = 0;
  #flyoutKey = null;

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
    this.#schedule();
  }

  _onClose(options) {
    super._onClose(options);
    store(`view.${this.document.id}.${game.user.id}`, this.#view);
    this.#root = null;
    this.#sigs.clear();
    this.#sel.clear();
    this.#first = true;
    this.#viewLoaded = false;
  }

  async _renderHTML() {
    return null;
  }

  /** La vista inicial se calcula con la ventana ya en pantalla (antes no tiene tamaño). */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#fitAll();
    if (this.#viewLoaded) return;
    this.#viewLoaded = true;
    const viewport = this.#root.querySelector(".mrp-viewport");
    const observer = new ResizeObserver(() => {
      if (viewport.clientWidth < 200 || viewport.clientHeight < 200) return;
      observer.disconnect();
      this.#fitAll();
      const saved = stored(`view.${this.document.id}.${game.user.id}`, null);
      if (saved) {
        this.#view = saved;
        this.#applyView();
      } else this.#fit();
    });
    observer.observe(viewport);
  }

  /** Ajusta el texto de todas las piezas (necesita la ventana ya en pantalla para poder medir). */
  #fitAll() {
    for (const el of this.#root?.querySelectorAll(".mrp-item") ?? []) fitText(el);
  }

  _replaceHTML(result, content) {
    if (!this.#root?.isConnected || !content.contains(this.#root)) this.#build(content);
    this.refresh();
  }

  /* ---------- construcción de la interfaz ---------- */

  #build(content) {
    const btn = ([name, icon, label, key]) =>
      `<button type="button" class="mrp-tool" data-tool="${name}" data-tooltip="${esc(t(label))}${key ? ` · ${key}` : ""}" data-tooltip-direction="RIGHT" aria-label="${esc(t(label))}"><i class="${icon}"></i></button>`;
    const rail = TOOLS.map((g) => `<div class="mrp-tools" data-group="${g.group}">${g.items.map(btn).join("")}</div>`).join("");
    content.innerHTML = `<div class="mrp-root" tabindex="-1">
      <nav class="mrp-rail" role="toolbar" aria-orientation="vertical" aria-label="${esc(t("title"))}">${rail}</nav>
      <div class="mrp-main">
        <header class="mrp-topbar">
          <div class="mrp-title"><span class="mrp-badge-logo"><i class="fa-solid fa-thumbtack"></i></span><div><strong class="mrp-name"></strong><small class="mrp-meta"></small></div></div>
          <div class="mrp-chips">
            ${game.user.isGM ? `<button type="button" class="mrp-chip mrp-chip-warn" data-act="pending" aria-haspopup="dialog" hidden><i class="fa-solid fa-link-slash"></i><span class="mrp-pendingcount"></span></button>
            <button type="button" class="mrp-chip" data-act="import" data-tooltip="${esc(t("importTip"))}"><i class="fa-solid fa-file-import"></i><span>${esc(t("importShort"))}</span></button>` : ""}
            <button type="button" class="mrp-chip" data-act="pins" aria-haspopup="dialog" data-tooltip="${esc(t("pinPreset"))}"><i class="fa-solid fa-thumbtack"></i><span class="mrp-pinlabel"></span></button>
            <button type="button" class="mrp-chip" data-act="bg"><i class="fa-solid fa-palette"></i><span class="mrp-bgname"></span></button>
            ${game.user.isGM ? `<button type="button" class="mrp-chip" data-act="lock"><i class="fa-solid fa-lock-open"></i><span>${esc(t("lock"))}</span></button>` : ""}
            <button type="button" class="mrp-chip mrp-chip-icon" data-act="a11y" aria-haspopup="dialog" data-tooltip="${esc(t("a11y"))}" aria-label="${esc(t("a11y"))}"><i class="fa-solid fa-universal-access"></i></button>
            <button type="button" class="mrp-chip mrp-chip-icon" data-act="help" data-tooltip="${esc(t("help"))}" aria-label="${esc(t("help"))}"><i class="fa-regular fa-circle-question"></i></button>
          </div>
        </header>
        <div class="mrp-viewport">
          <div class="mrp-world" style="width:${BOARD.width}px;height:${BOARD.height}px">
            <div class="mrp-surface"></div>
            <div class="mrp-items"></div><svg class="mrp-threads" width="${BOARD.width}" height="${BOARD.height}" aria-hidden="true"></svg><div class="mrp-pins" aria-hidden="true"></div>
            <div class="mrp-sel" hidden><span class="mrp-h" data-h="nw"></span><span class="mrp-h" data-h="ne"></span><span class="mrp-h" data-h="se"></span><span class="mrp-h" data-h="sw"></span><span class="mrp-stem"></span><span class="mrp-h mrp-h-rot" data-h="rot"><i class="fa-solid fa-rotate"></i></span></div>
          </div>
          <div class="mrp-marquee" hidden></div>
          <div class="mrp-hud" role="status"></div>
          <div class="mrp-hint"><i class="fa-regular fa-hand-pointer"></i> ${esc(t("empty"))}</div>
          <div class="mrp-selbar" hidden></div>
          <div class="mrp-zoombar"><button type="button" data-act="out" aria-label="${esc(t("zoomOut"))}" data-tooltip="${esc(t("zoomOut"))}"><i class="fa-solid fa-minus"></i></button><button type="button" class="mrp-zoomval" data-act="zoom100" data-tooltip="100%">70%</button><button type="button" data-act="in" aria-label="${esc(t("zoomIn"))}" data-tooltip="${esc(t("zoomIn"))}"><i class="fa-solid fa-plus"></i></button><button type="button" data-act="fit" aria-label="${esc(t("fit"))}" data-tooltip="${esc(t("fit"))}"><i class="fa-solid fa-expand"></i></button></div>
          <canvas class="mrp-minimap" width="220" height="138" aria-hidden="true"></canvas>
          <div class="mrp-help" hidden>${this.#helpHTML()}</div>
          <div class="mrp-live" role="status" aria-live="polite"></div>
        </div>
      </div></div>`;
    this.#root = content.querySelector(".mrp-root");
    this.#listen();
    this.#applyA11y();
  }

  #helpHTML() {
    const rows = ["helpEdit", "helpSelect", "helpMulti", "helpMove", "helpScale", "helpRotate", "helpPan", "helpDelete", "helpUndo", "helpDuplicate", "helpThread"].map((k) => `<li>${t(k)}</li>`).join("");
    return `<h4>${t("help")}</h4><ul>${rows}</ul>`;
  }

  #listen() {
    const root = this.#root;
    const viewport = root.querySelector(".mrp-viewport");
    root.querySelector(".mrp-rail").addEventListener("click", (event) => {
      const tool = event.target.closest("[data-tool]")?.dataset.tool;
      if (tool) this.#tool(tool);
    });
    root.addEventListener("click", (event) => {
      const act = event.target.closest("[data-act]")?.dataset.act;
      if (act) this.#act(act, event);
    });
    viewport.addEventListener("wheel", (event) => this.#wheel(event), { passive: false });
    viewport.addEventListener("pointerdown", (event) => this.#down(event));
    viewport.addEventListener("dblclick", (event) => {
      const id = event.target.closest(".mrp-item")?.dataset.id;
      if (id) this.#dblclick(id, event);
    });
    // un clic fuera de un desplegable lo cierra
    root.addEventListener("pointerdown", (event) => {
      if (!event.target.closest(".mrp-flyout, [data-tool], [data-act]")) this.#closeFlyout();
    }, true);
    // al llegar con el teclado a una pieza (Tab) queda seleccionada y se anuncia
    root.addEventListener("focusin", (event) => {
      const el = event.target.closest?.(".mrp-item");
      if (el && !this.#sel.has(el.dataset.id) && !this.#threadMode) this.#select([el.dataset.id]);
    });
    viewport.addEventListener("contextmenu", (event) => this.#contextmenu(event));
    viewport.addEventListener("dragover", (event) => event.preventDefault());
    viewport.addEventListener("drop", (event) => this.#drop(event));
    root.addEventListener("keydown", (event) => this.#key(event));
    root.addEventListener("keyup", (event) => {
      if (event.code === "Space" && this.#space) {
        this.#space = false;
        this.#modeClass();
      }
    });
    // las imágenes cambian la altura de las piezas: los hilos y la selección se recolocan al cargarlas
    root.querySelector(".mrp-items").addEventListener("load", () => this.#schedule(), true);
  }

  #toggleFlyout(key, open) {
    if (this.#flyoutKey === key) return this.#closeFlyout();
    open();
  }

  #act(act, event) {
    const rect = this.#root.querySelector(".mrp-viewport").getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (act === "in") this.#zoomAt(1.25, cx, cy);
    else if (act === "out") this.#zoomAt(0.8, cx, cy);
    else if (act === "fit") this.#fit();
    else if (act === "zoom100") this.#zoomAt(1 / this.#view.k, cx, cy);
    else if (act === "bg") this.#tool("bg");
    else if (act === "import") game.modules.get(ID).api.importBoard(this.document);
    else if (act === "pending") this.#toggleFlyout("pending", () => this.#pendingFlyout(event.target.closest("button")));
    else if (act === "pins") this.#toggleFlyout("pin-board", () => this.#pinFlyout(event.target.closest("button"), "board"));
    else if (act === "a11y") this.#toggleFlyout("a11y", () => this.#a11yFlyout(event.target.closest("button")));
    else if (act === "lock") this.#tool("lock");
    else if (act === "help") {
      const help = this.#root.querySelector(".mrp-help");
      help.hidden = !help.hidden;
    } else if (event.target.closest(".mrp-selbar")) this.#selbarAct(act, event);
  }

  /* ---------- vista (desplazar y acercar) ---------- */

  #applyView() {
    const { x, y, k } = this.#view;
    const world = this.#root.querySelector(".mrp-world");
    world.style.transform = `translate(${x}px,${y}px) scale(${k})`;
    world.style.setProperty("--ik", String(1 / k));
    this.#root.querySelector(".mrp-zoomval").textContent = `${Math.round(k * 100)}%`;
    this.#schedule();
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

  /** Encuadra todas las piezas (o la selección si la hay). */
  #fit() {
    const rect = this.#root.querySelector(".mrp-viewport").getBoundingClientRect();
    const snaps = this.#snaps(this.#sel.size ? this.#sel : this.#allIds());
    let box = { x1: 0, y1: 0, x2: BOARD.width, y2: BOARD.height };
    if (snaps.length) box = aabb(snaps.flatMap((s) => corners(s)));
    const pad = 90;
    const k = Math.min(1.1, Math.max(MIN_ZOOM, Math.min(rect.width / (box.x2 - box.x1 + pad * 2), rect.height / (box.y2 - box.y1 + pad * 2))));
    this.#view = { k, x: rect.width / 2 - ((box.x1 + box.x2) / 2) * k, y: rect.height / 2 - ((box.y1 + box.y2) / 2) * k };
    this.#applyView();
  }

  #centerOn(wx, wy) {
    const rect = this.#root.querySelector(".mrp-viewport").getBoundingClientRect();
    this.#view.x = rect.width / 2 - wx * this.#view.k;
    this.#view.y = rect.height / 2 - wy * this.#view.k;
    this.#applyView();
  }

  /* ---------- pintado y reconciliación ---------- */

  #allIds() {
    return [...this.#root.querySelectorAll(".mrp-item")].map((el) => el.dataset.id);
  }

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
    const lock = this.#root.querySelector("[data-act=lock]");
    if (lock) {
      lock.querySelector("i").className = `fa-solid ${board.locked ? "fa-lock" : "fa-lock-open"}`;
      lock.querySelector("span").textContent = t(board.locked ? "unlock" : "lock");
      lock.classList.toggle("on", Boolean(board.locked));
    }
    this.#root.querySelector(".mrp-name").textContent = this.document.name;
    this.#root.querySelector(".mrp-bgname").textContent = bg.name;
    this.#root.querySelector(".mrp-pinlabel").textContent = this.#pinLabel();
    const pending = this.#pending();
    const chip = this.#root.querySelector("[data-act=pending]");
    if (chip) {
      chip.hidden = !pending.length;
      chip.querySelector(".mrp-pendingcount").textContent = `${pending.length} ${t("unlinkedWord")}`;
    }
    const container = this.#root.querySelector(".mrp-items");
    const seen = new Set();
    for (const [id, item] of Object.entries(board.items ?? {})) {
      if (!visibleTo(item)) continue;
      seen.add(id);
      const { html, sig } = renderItem(id, item, board);
      const old = container.querySelector(`[data-id="${id}"]`);
      if (old && this.#sigs.get(id) === sig) continue;
      const el = document.createRange().createContextualFragment(html).firstElementChild;
      if (!old && !this.#first) el.classList.add("mrp-in");
      if (this.#sel.has(id)) el.classList.add("mrp-selected");
      if (old) old.replaceWith(el);
      else container.append(el);
      fitText(el);
      this.#sigs.set(id, sig);
    }
    for (const el of container.querySelectorAll(".mrp-item")) if (!seen.has(el.dataset.id)) el.remove();
    for (const id of [...this.#sigs.keys()]) if (!seen.has(id)) this.#sigs.delete(id);
    for (const id of [...this.#sel]) if (!seen.has(id)) this.#sel.delete(id);
    this.#root.querySelector(".mrp-hint").hidden = seen.size > 0;
    const links = Object.keys(board.links ?? {}).length;
    this.#root.querySelector(".mrp-meta").textContent = `${seen.size} ${t(seen.size === 1 ? "pieceOne" : "pieceMany")} · ${links} ${t(links === 1 ? "threadOne" : "threadMany")}`;
    this.#first = false;
    this.#hud();
    this.#buildPins();
    this.#drawThreads();
    this.#drawSel();
    this.#schedule();
  }

  /** Las sujeciones van en su propia capa, por encima de los hilos: así las puntas de un hilo quedan tras las chinchetas y el celo. */
  #buildPins() {
    const layer = this.#root.querySelector(".mrp-pins");
    layer.innerHTML = [...this.#root.querySelectorAll(".mrp-item")]
      .map((el) => {
        let specs = [];
        try {
          specs = JSON.parse(el.dataset.pins || "[]");
        } catch {
          /* sin sujeciones */
        }
        return specs.map((spec) => pinElementHTML(spec, el.dataset.id, el.classList.contains("mrp-hidden"))).join("");
      })
      .join("");
    this.#drawPins();
  }

  /** Coloca cada sujeción sobre su pieza (con la vista previa de mover/escalar/girar). Tamaño fijo: no se escalan con la pieza. */
  #drawPins() {
    const layer = this.#root?.querySelector(".mrp-pins");
    if (!layer) return;
    const items = new Map();
    for (const pin of layer.children) {
      const id = pin.dataset.item;
      if (!items.has(id)) items.set(id, this.#el(id));
      const el = items.get(id);
      pin.hidden = !el;
      if (!el) continue;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const pv = this.#preview.get(id);
      const f = pv?.f ?? 1;
      const rot = (Number(el.dataset.rot) || 0) + (pv?.th ?? 0);
      const p = rotate((Number(pin.dataset.x) - w / 2) * f, (Number(pin.dataset.y) - h / 2) * f, rot);
      pin.style.left = `${(pv?.cx ?? el.offsetLeft + w / 2) + p.x}px`;
      pin.style.top = `${(pv?.cy ?? el.offsetTop + h / 2) + p.y}px`;
      pin.style.setProperty("--r", `${Number(pin.dataset.r) + rot}deg`);
    }
  }

  /** Repinta hilos, selección y minimapa como mucho una vez por fotograma. */
  #schedule() {
    if (this.#raf || !this.#root) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = 0;
      if (!this.#root) return;
      this.#drawThreads();
      this.#drawSel();
      this.#drawMinimap();
    });
  }

  #hud() {
    const hud = this.#root.querySelector(".mrp-hud");
    let text = "";
    if (this.board.locked) text = `<i class="fa-solid fa-lock"></i> ${t("locked")}`;
    if (this.#threadMode) {
      const swatches = Object.entries(THREAD_COLORS).map(([name, hex]) => `<button type="button" class="mrp-dot ${name === this.#threadStyle.color ? "on" : ""}" data-color="${name}" style="--c:${hex}" aria-label="${name}"></button>`).join("");
      const styles = THREAD_STYLES.map((s) => `<button type="button" class="mrp-style ${s === this.#threadStyle.style ? "on" : ""}" data-style="${s}">${t(`threadStyle${s === "solido" ? "Solid" : s === "punteado" ? "Dotted" : "Dashed"}`)}</button>`).join("");
      text = `<i class="fa-solid fa-bezier-curve"></i><span>${t(this.#threadFrom ? "threadPickSecond" : "threadPickFirst")}</span>${swatches}${styles}`;
    }
    hud.innerHTML = text;
    hud.classList.toggle("on", Boolean(text));
    hud.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => ((this.#threadStyle.color = b.dataset.color), this.#hud())));
    hud.querySelectorAll("[data-style]").forEach((b) => b.addEventListener("click", () => ((this.#threadStyle.style = b.dataset.style), this.#hud())));
    this.#root.classList.toggle("mrp-threading", this.#threadMode);
    this.#modeClass();
  }

  #modeClass() {
    const hand = this.#mode === "hand" || this.#space;
    this.#root.classList.toggle("mrp-handmode", hand);
    this.#root.querySelectorAll("[data-tool]").forEach((b) => {
      const name = b.dataset.tool;
      b.classList.toggle("active", (name === "thread" && this.#threadMode) || (name === "select" && !hand && !this.#threadMode) || (name === "hand" && hand));
    });
  }

  /* ---------- geometría de piezas ---------- */

  #el(id) {
    return this.#root.querySelector(`.mrp-item[data-id="${id}"]`);
  }

  /** Estado de cada pieza en el lienzo: centro, tamaño y giro (el layout no cambia con las vistas previas). */
  #snaps(ids) {
    const out = [];
    for (const id of ids) {
      const el = this.#el(id);
      const item = this.board.items?.[id];
      if (!el || !item) continue;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      out.push({ id, el, item, w, h, cx: el.offsetLeft + w / 2, cy: el.offsetTop + h / 2, rot: Number(el.dataset.rot) || 0 });
    }
    return out;
  }

  /** Caja de la selección (con la vista previa aplicada): girada si es una sola pieza, alineada a los ejes si son varias. */
  #bounds() {
    const snaps = this.#snaps(this.#sel).map((s) => {
      const pv = this.#preview.get(s.id);
      return pv ? { ...s, cx: pv.cx, cy: pv.cy, w: s.w * pv.f, h: s.h * pv.f, rot: s.rot + pv.th } : s;
    });
    if (!snaps.length) return null;
    if (snaps.length === 1) return snaps[0];
    const box = aabb(snaps.flatMap((s) => corners(s)));
    return { cx: (box.x1 + box.x2) / 2, cy: (box.y1 + box.y2) / 2, w: box.x2 - box.x1, h: box.y2 - box.y1, rot: 0 };
  }

  #drawSel() {
    const sel = this.#root.querySelector(".mrp-sel");
    const box = this.#sel.size && !this.#threadMode ? this.#bounds() : null;
    sel.hidden = !box || !this.canEdit;
    if (!box) return this.#drawSelbar();
    const pad = 8;
    Object.assign(sel.style, { left: `${box.cx - box.w / 2 - pad}px`, top: `${box.cy - box.h / 2 - pad}px`, width: `${box.w + pad * 2}px`, height: `${box.h + pad * 2}px`, transform: `rotate(${box.rot}deg)` });
    this.#drawSelbar();
  }

  /* ---------- barra de la selección ---------- */

  #drawSelbar() {
    const bar = this.#root.querySelector(".mrp-selbar");
    const n = this.#sel.size;
    bar.hidden = !n || !this.canEdit || this.#threadMode;
    if (bar.hidden) return;
    const b = (act, icon, label, extra = "") => `<button type="button" data-act="${act}" data-tooltip="${esc(t(label))}" aria-label="${esc(t(label))}" ${extra}><i class="${icon}"></i></button>`;
    const sep = `<span class="mrp-sep"></span>`;
    bar.innerHTML = `<span class="mrp-count">${n} ${t(n === 1 ? "pieceOne" : "pieceMany")}</span>${sep}
      ${b("rot-", "fa-solid fa-rotate-left", "rotateLeft")}${b("rot+", "fa-solid fa-rotate-right", "rotateRight")}${sep}
      ${b("scale-", "fa-solid fa-down-left-and-up-right-to-center", "scaleDown")}${b("scale+", "fa-solid fa-up-right-and-down-left-from-center", "scaleUp")}${sep}
      ${n > 1 ? `${b("align", "fa-solid fa-align-left", "align")}${sep}` : ""}
      ${b("pins", "fa-solid fa-thumbtack", "decoration")}${n === 1 ? b("details", "fa-solid fa-sliders", "editDetails") : ""}
      ${b("dup", "fa-regular fa-clone", "duplicate")}${b("front", "fa-solid fa-arrow-up-long", "front")}${b("back", "fa-solid fa-arrow-down-long", "back")}
      ${game.user.isGM ? b("hide", "fa-solid fa-eye-slash", "hideToggle") : ""}${sep}${b("del", "fa-solid fa-trash", "remove", 'class="danger"')}`;
  }

  #selbarAct(act, event) {
    if (act === "rot-") return this.#rotateSel(-15);
    if (act === "rot+") return this.#rotateSel(15);
    if (act === "scale-") return this.#scaleSel(0.9);
    if (act === "scale+") return this.#scaleSel(1.1);
    if (act === "align") return this.#alignMenu(event);
    if (act === "pins") return this.#toggleFlyout("pin-selection", () => this.#pinFlyout(event.target.closest("button"), "selection"));
    if (act === "details") return this.#edit([...this.#sel][0]);
    if (act === "dup") return this.#duplicate();
    if (act === "front") return this.#reorder(true);
    if (act === "back") return this.#reorder(false);
    if (act === "hide") return this.#toggleHidden();
    if (act === "del") return this.#removeSel();
  }

  /* ---------- selección ---------- */

  #select(ids, { add = false, toggle = false } = {}) {
    if (!add && !toggle) this.#sel.clear();
    for (const id of ids) {
      if (toggle && this.#sel.has(id)) this.#sel.delete(id);
      else this.#sel.add(id);
    }
    this.#root.querySelectorAll(".mrp-item").forEach((el) => el.classList.toggle("mrp-selected", this.#sel.has(el.dataset.id)));
    this.#drawSel();
    this.#schedule();
    if (this.#sel.size) this.#say(`${this.#sel.size} ${t(this.#sel.size === 1 ? "pieceOne" : "pieceMany")} ${t("selectedWord")}`);
  }

  /* ---------- hilos ---------- */

  #anchor(el, id) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pv = this.#preview.get(id);
    const f = pv?.f ?? 1;
    const p = rotate((Number(el.dataset.ax) - w / 2) * f, (Number(el.dataset.ay) - h / 2) * f, (Number(el.dataset.rot) || 0) + (pv?.th ?? 0));
    return { x: (pv?.cx ?? el.offsetLeft + w / 2) + p.x, y: (pv?.cy ?? el.offsetTop + h / 2) + p.y };
  }

  #drawThreads() {
    this.#drawPins();
    const svg = this.#root.querySelector(".mrp-threads");
    const links = this.board.links ?? {};
    const parts = [];
    for (const [id, link] of Object.entries(links)) {
      const a = this.#el(link.from);
      const b = this.#el(link.to);
      if (!a || !b) continue;
      const p = this.#anchor(a, link.from);
      const q = this.#anchor(b, link.to);
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

  /* ---------- minimapa ---------- */

  #drawMinimap() {
    const canvas = this.#root.querySelector(".mrp-minimap");
    const ctx = canvas.getContext("2d");
    const s = canvas.width / BOARD.width;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(20,16,12,0.85)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const colors = { note: "#e9d36a", clipping: "#d9cdb0", photo: "#f1efe9", journal: "#cdbb94", entity: "#f1efe9", stamp: "#c9604f", mark: "#c9604f" };
    for (const sn of this.#snaps(this.#allIds())) {
      ctx.fillStyle = this.#sel.has(sn.id) ? "#ffd166" : (colors[sn.item.type] ?? "#ccc");
      const pv = this.#preview.get(sn.id);
      const box = pv ? { ...sn, cx: pv.cx, cy: pv.cy, w: sn.w * pv.f, h: sn.h * pv.f } : sn;
      ctx.fillRect((box.cx - box.w / 2) * s, (box.cy - box.h / 2) * s, Math.max(2, box.w * s), Math.max(2, box.h * s));
    }
    const vp = this.#root.querySelector(".mrp-viewport");
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect((-this.#view.x / this.#view.k) * s, (-this.#view.y / this.#view.k) * s, (vp.clientWidth / this.#view.k) * s, (vp.clientHeight / this.#view.k) * s);
  }

  #minimapPoint(event) {
    const canvas = this.#root.querySelector(".mrp-minimap");
    const r = canvas.getBoundingClientRect();
    this.#centerOn(((event.clientX - r.left) / r.width) * BOARD.width, ((event.clientY - r.top) / r.height) * BOARD.height);
  }

  /* ---------- interacción con el puntero ---------- */

  #down(event) {
    if (event.button === 2 && event.target.closest(".mrp-item, .mrp-thread, .mrp-h, .mrp-menu, .mrp-flyout, .mrp-selbar, .mrp-zoombar, .mrp-minimap, .mrp-help, .mrp-hud")) return; // ahí el botón derecho abre el menú
    if (event.target.closest("[contenteditable=plaintext-only], [contenteditable=true]")) return;
    this.#closeMenu();
    this.#root.focus({ preventScroll: true });
    if (event.target.closest(".mrp-minimap")) return this.#track(event, (e) => this.#minimapPoint(e), () => {}, () => this.#minimapPoint(event));
    if (event.target.closest(".mrp-hud, .mrp-selbar, .mrp-zoombar, .mrp-help, .mrp-menu")) return;
    const handle = event.target.closest(".mrp-h");
    if (handle && this.canEdit) return this.#startTransform(event, handle.dataset.h);
    const threadEl = event.target.closest(".mrp-thread");
    // los hilos van por delante de las piezas: si hay una pieza bajo el hilo, el clic es de la pieza
    const itemEl = event.target.closest(".mrp-item") ?? (threadEl ? document.elementsFromPoint(event.clientX, event.clientY).find((el) => el.classList?.contains("mrp-item")) : null);
    const pan = event.button === 1 || event.button === 2 || this.#mode === "hand" || this.#space;
    if (threadEl && !itemEl && event.button === 0 && !pan) return this.#threadMenu(threadEl.dataset.link, event);
    if (pan) return this.#startPan(event, event.button === 0);
    if (itemEl) {
      const id = itemEl.dataset.id;
      if (this.#threadMode) return this.#threadPick(id);
      if (event.shiftKey || event.ctrlKey || event.metaKey) return this.#select([id], { toggle: true });
      if (!this.#sel.has(id)) this.#select([id]);
      if (!this.canEdit) return;
      return this.#startDrag(event, id);
    }
    if (this.#threadMode) return this.#startPan(event);
    return this.#startMarquee(event);
  }

  /** Sigue el puntero hasta soltarlo. `onClick` se llama si no hubo movimiento. */
  #track(event, onMove, onUp, onClick) {
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    const move = (e) => {
      if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 3) return;
      moved = true;
      onMove(e, start);
    };
    const up = (e) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (moved) onUp(e, start);
      else onClick?.(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    event.preventDefault();
  }

  /** `clearOnClick`: un clic sin arrastrar deselecciona (no con el botón derecho ni el central). */
  #startPan(event, clearOnClick = true) {
    const base = { x: this.#view.x, y: this.#view.y };
    this.#root.classList.add("mrp-panning");
    this.#track(event, (e, s) => {
      this.#view.x = base.x + e.clientX - s.x;
      this.#view.y = base.y + e.clientY - s.y;
      this.#applyView();
    }, () => this.#root.classList.remove("mrp-panning"), () => {
      this.#root.classList.remove("mrp-panning");
      if (clearOnClick && !this.#threadMode) this.#select([]);
    });
  }

  #startMarquee(event) {
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    const vp = this.#root.querySelector(".mrp-viewport").getBoundingClientRect();
    const box = this.#root.querySelector(".mrp-marquee");
    const base = new Set(this.#sel);
    this.#track(event, (e, s) => {
      const x1 = Math.min(s.x, e.clientX) - vp.left;
      const y1 = Math.min(s.y, e.clientY) - vp.top;
      Object.assign(box.style, { left: `${x1}px`, top: `${y1}px`, width: `${Math.abs(e.clientX - s.x)}px`, height: `${Math.abs(e.clientY - s.y)}px` });
      box.hidden = false;
      const a = this.#toWorld(Math.min(s.x, e.clientX), Math.min(s.y, e.clientY));
      const b = this.#toWorld(Math.max(s.x, e.clientX), Math.max(s.y, e.clientY));
      const hit = this.#snaps(this.#allIds()).filter((sn) => {
        const bb = aabb(corners(sn));
        return bb.x2 >= a.x && bb.x1 <= b.x && bb.y2 >= a.y && bb.y1 <= b.y;
      }).map((sn) => sn.id);
      this.#select(additive ? [...base, ...hit] : hit);
    }, () => (box.hidden = true), () => {
      if (!additive) this.#select([]);
    });
  }

  /** Mueve la selección: vista previa por CSS y, al soltar, un solo lote de operaciones. */
  #startDrag(event, id) {
    const ids = this.#sel.has(id) ? [...this.#sel] : [id];
    const snaps = this.#snaps(ids);
    const lock = snaps.map((s) => this.#live.get(s.id)).find((l) => l && l.until > Date.now() && l.user !== game.user.id);
    if (lock) return ui.notifications.info(`${game.users.get(lock.user)?.name ?? "?"}…`);
    let last = 0;
    let delta = { x: 0, y: 0 };
    this.#track(event, (e, s) => {
      delta = { x: (e.clientX - s.x) / this.#view.k, y: (e.clientY - s.y) / this.#view.k };
      this.#setPreview(new Map(snaps.map((sn) => [sn.id, { cx: sn.cx + delta.x, cy: sn.cy + delta.y, f: 1, th: 0 }])));
      this.#root.classList.add("mrp-moving");
      if (Date.now() - last > 70) {
        last = Date.now();
        game.socket.emit(SOCKET, { action: "live", docId: this.document.id, moves: snaps.slice(0, 40).map((sn) => ({ id: sn.id, x: Math.round(sn.item.x + delta.x), y: Math.round(sn.item.y + delta.y) })) });
      }
    }, () => {
      this.#root.classList.remove("mrp-moving");
      const z = this.#topZ();
      const ordered = [...snaps].sort((a, b) => a.item.z - b.item.z);
      this.#commit(ordered.map((sn, i) => ({ op: "set", kind: "items", id: sn.id, data: { x: Math.round(sn.item.x + delta.x), y: Math.round(sn.item.y + delta.y), z: z + 1 + i } })));
    }, () => {
      /* clic sin arrastrar sobre una pieza de una selección múltiple: se queda solo con ella */
      if (this.#sel.size > 1 && !event.shiftKey) this.#select([id]);
    });
  }

  /** Escalar o girar la selección alrededor de su centro. */
  #startTransform(event, kind) {
    const box = this.#bounds();
    const snaps = this.#snaps(this.#sel);
    if (!box || !snaps.length) return;
    const C = { x: box.cx, y: box.cy };
    const p0 = this.#toWorld(event.clientX, event.clientY);
    const d0 = Math.max(10, Math.hypot(p0.x - C.x, p0.y - C.y));
    const a0 = Math.atan2(p0.y - C.y, p0.x - C.x);
    const fMin = Math.max(...snaps.map((s) => 60 / s.w));
    const fMax = Math.min(...snaps.map((s) => 1100 / s.w));
    let state = { f: 1, th: 0 };
    this.#track(event, (e, s) => {
      const p = this.#toWorld(e.clientX, e.clientY);
      if (kind === "rot") {
        let th = ((Math.atan2(p.y - C.y, p.x - C.x) - a0) * 180) / Math.PI;
        if (e.shiftKey) th = Math.round(th / 15) * 15;
        state = { f: 1, th };
      } else state = { f: Math.min(fMax, Math.max(fMin, Math.hypot(p.x - C.x, p.y - C.y) / d0)), th: 0 };
      this.#setPreview(this.#transformed(snaps, C, state.f, state.th));
    }, () => this.#commitTransform(snaps, C, state.f, state.th));
  }

  #transformed(snaps, C, f, th) {
    return new Map(snaps.map((s) => {
      const p = rotate((s.cx - C.x) * f, (s.cy - C.y) * f, th);
      return [s.id, { cx: C.x + p.x, cy: C.y + p.y, f, th }];
    }));
  }

  #commitTransform(snaps, C, f, th) {
    const map = this.#transformed(snaps, C, f, th);
    this.#commit(snaps.map((s) => {
      const pv = map.get(s.id);
      const w = Math.round(Math.min(1100, Math.max(60, s.w * f)));
      const h = s.h * (w / s.w);
      const data = { x: Math.round(pv.cx - w / 2), y: Math.round(pv.cy - h / 2) };
      if (f !== 1) data.w = w;
      if (th) data.rot = Math.round(normDeg(s.rot + th));
      return { op: "set", kind: "items", id: s.id, data };
    }));
  }

  /** Botones de la barra: giro y escala de 15°/10 % alrededor del centro de la selección. */
  #rotateSel(deg) {
    const box = this.#bounds();
    if (box) this.#commitTransform(this.#snaps(this.#sel), { x: box.cx, y: box.cy }, 1, deg);
  }

  #scaleSel(f) {
    const box = this.#bounds();
    const snaps = this.#snaps(this.#sel);
    if (!box) return;
    const g = Math.min(Math.min(...snaps.map((s) => 1100 / s.w)), Math.max(Math.max(...snaps.map((s) => 60 / s.w)), f));
    this.#commitTransform(snaps, { x: box.cx, y: box.cy }, g, 0);
  }

  #setPreview(map) {
    for (const [id, pv] of map) {
      const sn = this.#snaps([id])[0];
      if (!sn) continue;
      sn.el.style.transform = `translate(${pv.cx - sn.cx}px,${pv.cy - sn.cy}px) rotate(${pv.th}deg) scale(${pv.f})`;
    }
    this.#preview = map;
    this.#drawThreads();
    this.#drawSel();
    this.#drawMinimap();
  }

  #clearPreview() {
    for (const id of this.#preview.keys()) {
      const el = this.#el(id);
      if (el) el.style.transform = "";
    }
    this.#preview = new Map();
  }

  onLive(message, senderId) {
    if (message.docId !== this.document.id || senderId === game.user.id || !this.#root) return;
    for (const mv of message.moves ?? []) {
      const el = this.#el(mv.id);
      if (!el) continue;
      this.#live.set(mv.id, { user: senderId, until: Date.now() + LIVE_MS });
      el.style.left = `${mv.x}px`;
      el.style.top = `${mv.y}px`;
      el.classList.add("mrp-remote");
      clearTimeout(el._mrpLive);
      el._mrpLive = setTimeout(() => el.classList.remove("mrp-remote"), LIVE_MS);
    }
    this.#schedule();
  }

  /* ---------- operaciones e historial ---------- */

  /** Deshace lo que hace `ops`: valores anteriores de cada campo; lo creado se quita; lo quitado se devuelve con sus hilos. */
  #inverse(ops) {
    const b = this.board;
    const keep = (old, data, id, kind) => {
      const out = {};
      for (const k of Object.keys(data)) {
        if (k in old) out[k] = old[k];
        else if (kind === "items") {
          // campos que la pieza no tenía guardados: se restaura el valor efectivo que tenía
          if (k === "rot") out[k] = look(id, old).rot;
          else if (k === "w") out[k] = widthOf(old);
          else if (k === "hidden") out[k] = false;
          else if (k === "owner") out[k] = "";
        }
      }
      return out;
    };
    const groups = [];
    for (const op of ops) {
      if (op.kind === "items") {
        const old = b.items?.[op.id];
        if (op.op === "set") groups.push([old ? { op: "set", kind: "items", id: op.id, data: keep(old, op.data, op.id, "items") } : { op: "remove", kind: "items", id: op.id }]);
        else if (old) {
          const links = Object.entries(b.links ?? {}).filter(([, l]) => l.from === op.id || l.to === op.id).map(([id, l]) => ({ op: "set", kind: "links", id, data: { ...l } }));
          groups.push([{ op: "set", kind: "items", id: op.id, data: { ...old } }, ...links]);
        }
      } else if (op.kind === "links") {
        const old = b.links?.[op.id];
        if (op.op === "set") groups.push([old ? { op: "set", kind: "links", id: op.id, data: keep(old, op.data, op.id, "links") } : { op: "remove", kind: "links", id: op.id }]);
        else if (old) groups.push([{ op: "set", kind: "links", id: op.id, data: { ...old } }]);
      } else if (op.kind === "settings") {
        const data = {};
        for (const k of Object.keys(op.data)) if (k in b) data[k] = b[k];
        if (Object.keys(data).length) groups.push([{ op: "set", kind: "settings", id: op.id, data }]);
      }
    }
    // primero las piezas y después los hilos: un hilo entre dos piezas borradas necesita a las dos ya devueltas
    const flat = groups.reverse().flat();
    return [...flat.filter((op) => op.kind !== "links"), ...flat.filter((op) => op.kind === "links")];
  }

  async #commit(ops, { record = true } = {}) {
    if (!ops.length) return;
    const inverse = record ? this.#inverse(ops) : null;
    try {
      await sendChunked(this.document, ops);
      if (inverse?.length) {
        this.#history.push(inverse);
        if (this.#history.length > 60) this.#history.shift();
      }
    } catch (error) {
      ui.notifications.warn(error.message);
      this.#clearPreview();
      this.#sigs.clear();
      this.refresh();
    }
  }

  #undo() {
    const inverse = this.#history.pop();
    if (!inverse) return;
    const ops = game.user.isGM ? inverse : inverse.map((op) => (op.data && "hidden" in op.data ? { ...op, data: Object.fromEntries(Object.entries(op.data).filter(([k]) => k !== "hidden")) } : op));
    this.#commit(ops, { record: false });
  }

  #topZ() {
    return Math.max(1, ...Object.values(this.board.items ?? {}).map((i) => i.z ?? 0));
  }

  /* ---------- acciones sobre la selección ---------- */

  #selected() {
    return [...this.#sel].filter((id) => this.board.items?.[id]);
  }

  #removeSel() {
    const ids = this.#selected();
    if (!ids.length) return;
    this.#sel.clear();
    return this.#commit(ids.map((id) => ({ op: "remove", kind: "items", id })));
  }

  #duplicate() {
    const ids = this.#selected();
    if (!ids.length) return;
    const map = new Map(ids.map((id) => [id, uid()]));
    const top = this.#topZ();
    const items = ids.map((id, i) => {
      const { z, ...item } = this.board.items[id];
      return { op: "set", kind: "items", id: map.get(id), data: { ...item, x: item.x + 36, y: item.y + 36, z: top + 1 + i } };
    });
    const links = Object.values(this.board.links ?? {}).filter((l) => map.has(l.from) && map.has(l.to)).map((l) => ({ op: "set", kind: "links", id: uid(), data: { from: map.get(l.from), to: map.get(l.to), color: l.color, style: l.style, label: l.label ?? "" } }));
    this.#commit([...items, ...links]).then(() => this.#select([...map.values()]));
  }

  #reorder(front) {
    const ids = this.#selected().sort((a, b) => this.board.items[a].z - this.board.items[b].z);
    if (front) {
      const top = this.#topZ();
      return this.#commit(ids.map((id, i) => ({ op: "set", kind: "items", id, data: { z: top + 1 + i } })));
    }
    return this.#commit(ids.map((id) => ({ op: "set", kind: "items", id, data: { z: 0 } })));
  }

  #toggleHidden() {
    const ids = this.#selected();
    const hide = !ids.every((id) => this.board.items[id].hidden);
    return this.#commit(ids.map((id) => ({ op: "set", kind: "items", id, data: { hidden: hide } })));
  }

  #togglePrivate() {
    const ids = this.#selected();
    const priv = !ids.every((id) => this.board.items[id].owner);
    return this.#commit(ids.map((id) => ({ op: "set", kind: "items", id, data: { owner: priv ? game.user.id : "" } })));
  }

  /** Alinear y distribuir: operan sobre la caja que ocupa cada pieza (girada). */
  #align(mode) {
    const snaps = this.#snaps(this.#sel);
    if (snaps.length < 2) return;
    const boxes = snaps.map((s) => ({ s, b: aabb(corners(s)) }));
    const all = aabb(boxes.flatMap(({ b }) => [{ x: b.x1, y: b.y1 }, { x: b.x2, y: b.y2 }]));
    const moves = new Map(boxes.map(({ s }) => [s.id, { dx: 0, dy: 0 }]));
    const set = (fn) => boxes.forEach(({ s, b }) => Object.assign(moves.get(s.id), fn(b)));
    if (mode === "left") set((b) => ({ dx: all.x1 - b.x1 }));
    if (mode === "right") set((b) => ({ dx: all.x2 - b.x2 }));
    if (mode === "centerH") set((b) => ({ dx: (all.x1 + all.x2) / 2 - (b.x1 + b.x2) / 2 }));
    if (mode === "top") set((b) => ({ dy: all.y1 - b.y1 }));
    if (mode === "bottom") set((b) => ({ dy: all.y2 - b.y2 }));
    if (mode === "centerV") set((b) => ({ dy: (all.y1 + all.y2) / 2 - (b.y1 + b.y2) / 2 }));
    if ((mode === "distH" || mode === "distV") && boxes.length > 2) {
      const h = mode === "distH";
      const sorted = [...boxes].sort((a, b) => (h ? a.b.x1 - b.b.x1 : a.b.y1 - b.b.y1));
      const total = sorted.reduce((sum, { b }) => sum + (h ? b.x2 - b.x1 : b.y2 - b.y1), 0);
      const gap = ((h ? all.x2 - all.x1 : all.y2 - all.y1) - total) / (sorted.length - 1);
      let pos = h ? all.x1 : all.y1;
      for (const { s, b } of sorted) {
        moves.get(s.id)[h ? "dx" : "dy"] = pos - (h ? b.x1 : b.y1);
        pos += (h ? b.x2 - b.x1 : b.y2 - b.y1) + gap;
      }
    }
    this.#commit(snaps.map((s) => ({ op: "set", kind: "items", id: s.id, data: { x: Math.round(s.item.x + moves.get(s.id).dx), y: Math.round(s.item.y + moves.get(s.id).dy) } })));
  }

  #alignMenu(event) {
    const e = (icon, label, fn) => ({ icon: `fa-solid ${icon}`, label: t(label), fn });
    this.#menu(event, [
      e("fa-align-left", "alignLeft", () => this.#align("left")),
      e("fa-align-center", "alignCenterH", () => this.#align("centerH")),
      e("fa-align-right", "alignRight", () => this.#align("right")),
      e("fa-arrow-up-from-bracket", "alignTop", () => this.#align("top")),
      e("fa-grip-lines", "alignCenterV", () => this.#align("centerV")),
      e("fa-arrow-down-to-line", "alignBottom", () => this.#align("bottom")),
      this.#sel.size > 2 && e("fa-ellipsis", "distributeH", () => this.#align("distH")),
      this.#sel.size > 2 && e("fa-ellipsis-vertical", "distributeV", () => this.#align("distV")),
    ]);
  }

  /* ---------- herramientas ---------- */

  #tool(name) {
    if (name === "select" || name === "hand") {
      this.#mode = name;
      this.#threadMode = false;
      this.#threadFrom = null;
      this.#root.querySelectorAll(".mrp-threadsrc").forEach((el) => el.classList.remove("mrp-threadsrc"));
      return this.#hud();
    }
    if (name === "thread") {
      this.#threadMode = !this.#threadMode;
      this.#threadFrom = null;
      this.#root.querySelectorAll(".mrp-threadsrc").forEach((el) => el.classList.remove("mrp-threadsrc"));
      if (this.#threadMode) this.#select([]);
      return this.#hud();
    }
    if (name === "lock") return this.#commit([{ op: "set", kind: "settings", id: uid(), data: { locked: !this.board.locked } }]);
    if (!this.canEdit) return ui.notifications.warn(t("locked"));
    if (name === "bg") return this.#pickBackground();
    const button = this.#root.querySelector(`[data-tool="${name}"]`);
    return this.#toggleFlyout(name, () => (name === "doc" ? this.#docFlyout(button) : this.#variantFlyout(name, button)));
  }

  #center() {
    const rect = this.#root.querySelector(".mrp-viewport").getBoundingClientRect();
    const p = this.#toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { x: p.x + (Math.random() - 0.5) * 120, y: p.y + (Math.random() - 0.5) * 80 };
  }

  async #createDetailed(type, at) {
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
    const w = widthOf({ ...base, ...data });
    const id = uid();
    await this.#commit([{ op: "set", kind: "items", id, data: { ...base, ...data, x: Math.round(point.x - w / 2), y: Math.round(point.y - w / 2), z: this.#topZ() + 1 } }]);
    this.#select([id]);
  }

  async #pickBackground() {
    const data = await foundry.applications.api.DialogV2.input({
      window: { title: t("background"), icon: "fa-solid fa-palette" },
      position: { width: 640 },
      content: `<div class="mrp-form">${choice("background", BACKGROUNDS.map((b) => ({ ...b, group: t(`group${{ Clásicos: "Classic", Época: "Period", "Moderno y futuro": "Modern" }[b.group]}`) })), this.board.background ?? "corcho-claro")}</div>`,
      ok: { label: t("save"), icon: "fa-solid fa-check" },
      rejectClose: false,
    });
    if (data?.background) this.#commit([{ op: "set", kind: "settings", id: uid(), data: { background: data.background } }]);
  }

  /** Cuelga un documento. Si es una ficha que algún jugador no puede ver, la Guardiana decide si mostrar su nombre e imagen a todos. */
  async #addRef(uuid, point) {
    const match = /^(JournalEntry|Actor|Scene|Item|RollTable)\./.exec(uuid);
    if (!match) return ui.notifications.warn(t("dropUnsupported"));
    const type = match[1] === "JournalEntry" ? "journal" : "entity";
    const w = widthOf({ type });
    const data = { type, uuid, x: Math.round(point.x - w / 2), y: Math.round(point.y - w / 2), z: this.#topZ() + 1 };
    if (type === "entity" && game.user.isGM) {
      const doc = await fromUuid(uuid);
      if (doc && game.users.some((u) => !u.isGM && !doc.testUserPermission(u, "OBSERVER"))) {
        const show = await foundry.applications.api.DialogV2.confirm({
          window: { title: t("revealTitle"), icon: "fa-solid fa-eye" },
          content: `<p>${t("revealAsk").replace("{name}", `<strong>${esc(doc.name)}</strong>`)}</p><p class="hint">${t("revealHint")}</p>`,
          yes: { label: t("revealYes"), icon: "fa-solid fa-eye" },
          no: { label: t("revealNo"), icon: "fa-solid fa-eye-slash" },
          rejectClose: false,
        });
        if (show) data.reveal = this.#snapshot(doc);
      }
    }
    return this.#commit([{ op: "set", kind: "items", id: uid(), data }]);
  }

  /** Nombre e imagen de un documento para mostrarlos a quien no tiene permiso sobre él. */
  #snapshot(doc) {
    const img = String((doc.documentName === "Scene" ? (doc.thumb ?? doc.background?.src) : doc.img) ?? "");
    return { name: doc.name, img: /\.(png|jpe?g|webp|gif|avif|svg)(\?[^\s"'<>]*)?$/i.test(img) && !img.includes("..") ? img : "" };
  }

  async #toggleReveal(id) {
    const item = this.board.items[id];
    if (!item) return;
    if (item.reveal) return this.#commit([{ op: "set", kind: "items", id, data: { reveal: null } }]);
    const doc = item.uuid ? await fromUuid(item.uuid) : null;
    const reveal = doc ? this.#snapshot(doc) : { name: item.name ?? "", img: item.img ?? "" };
    this.#commit([{ op: "set", kind: "items", id, data: { reveal } }]);
    this.#say(t("shownBadge"));
  }

  /* ---------- fichas sin vincular ---------- */

  #pending() {
    return Object.entries(this.board.items ?? {}).filter(([, i]) => i.type === "entity" && !i.uuid).map(([id, i]) => ({ id, ...i }));
  }

  #pendingFlyout(anchor) {
    const rows = this.#pending().map((p) => `<div class="mrp-pendrow" data-id="${p.id}"><div><strong>${esc(p.name)}</strong><small>${esc(p.kind ? t(`kind${p.kind}`) : t("kindUnknown"))}${p.hidden ? ` · ${esc(t("hiddenBadge"))}` : ""}</small></div>
      <button type="button" data-p="locate" data-tooltip="${esc(t("locate"))}" aria-label="${esc(t("locate"))}"><i class="fa-solid fa-location-crosshairs"></i></button>
      <button type="button" data-p="link" data-tooltip="${esc(t("linkDoc"))}" aria-label="${esc(t("linkDoc"))}"><i class="fa-solid fa-link"></i></button>
      ${!p.kind || p.kind === "Actor" ? `<button type="button" data-p="create" data-tooltip="${esc(t("createActor"))}" aria-label="${esc(t("createActor"))}"><i class="fa-solid fa-user-plus"></i></button>` : ""}</div>`).join("");
    this.#flyout(anchor, t("unlinkedTitle"), `<p class="mrp-fly-note">${esc(t("unlinkedHint"))}</p>${rows || `<p class="mrp-fly-note">${esc(t("allLinked"))}</p>`}`, {
      side: "below",
      key: "pending",
      mount: (box) =>
        box.addEventListener("click", (event) => {
          const b = event.target.closest("[data-p]");
          const id = b?.closest("[data-id]")?.dataset.id;
          if (!b || !id) return;
          if (b.dataset.p === "locate") return this.#locate(id);
          if (b.dataset.p === "link") return this.#linkFlyout(id, box);
          if (b.dataset.p === "create") return this.#createActorFor(id);
        }),
    });
  }

  #locate(id) {
    const el = this.#el(id);
    if (!el) return;
    this.#select([id]);
    this.#centerOn(el.offsetLeft + el.offsetWidth / 2, el.offsetTop + el.offsetHeight / 2);
  }

  /** Lista de documentos existentes para vincular una ficha (actores, escenas, objetos, tablas) con buscador. */
  #linkFlyout(id, from) {
    const item = this.board.items[id];
    if (!item) return;
    const sources = { Actor: game.actors, Scene: game.scenes, Item: game.items, RollTable: game.tables };
    const kinds = item.kind ? [item.kind] : ["Actor", "Scene", "Item", "RollTable"];
    const entries = kinds.flatMap((k) => (sources[k]?.contents ?? []).map((d) => ({ k, name: d.name, uuid: d.uuid })));
    let group = null;
    const rows = entries.map((e) => {
      const head = e.k !== group ? `<h5 class="mrp-group">${esc(t(`kind${e.k}`))}</h5>` : "";
      group = e.k;
      return `${head}<button type="button" class="mrp-doc" data-uuid="${e.uuid}" data-q="${esc(e.name.toLowerCase())}"><i class="fa-solid fa-link"></i> ${esc(e.name)}</button>`;
    });
    const anchor = from?.parentElement ? this.#root.querySelector("[data-act=pending]") ?? this.#el(id) : this.#el(id);
    this.#flyout(anchor, `${t("linkDoc")}: ${item.name}`, `<input type="search" class="mrp-search" value="${esc(item.name)}" aria-label="${esc(t("search"))}"><div class="mrp-doclist">${rows.join("") || `<p class="mrp-fly-note">${esc(t("noDocs"))}</p>`}</div>`, {
      side: "below",
      key: "link",
      mount: (box) => {
        const filter = () => {
          const q = box.querySelector(".mrp-search").value.trim().toLowerCase();
          box.querySelectorAll(".mrp-doc").forEach((b) => (b.hidden = Boolean(q) && !b.dataset.q.includes(q)));
        };
        box.querySelector(".mrp-search").addEventListener("input", filter);
        filter();
        box.addEventListener("click", (event) => {
          const uuid = event.target.closest("[data-uuid]")?.dataset.uuid;
          if (!uuid) return;
          this.#closeFlyout();
          this.#commit([{ op: "set", kind: "items", id, data: { uuid } }]);
          this.#say(t("linked"));
        });
      },
    });
  }

  async #createActorFor(id) {
    const item = this.board.items[id];
    const types = (Actor.TYPES ?? []).filter((x) => x !== "base");
    if (!item || !types.length) return ui.notifications.warn(t("noActorTypes"));
    const label = (x) => game.i18n.localize(CONFIG.Actor.typeLabels?.[x] ?? x);
    const data = await foundry.applications.api.DialogV2.input({
      window: { title: t("createActor"), icon: "fa-solid fa-user-plus" },
      position: { width: 420 },
      content: `<div class="form-group"><label>${esc(t("actorType"))}</label><div class="form-fields"><select name="type">${types.map((x) => `<option value="${x}">${esc(label(x))}</option>`).join("")}</select></div></div><p class="hint">${esc(t("createActorHint"))}</p>`,
      ok: { label: t("create"), icon: "fa-solid fa-check" },
      rejectClose: false,
    });
    if (!data) return;
    const actor = await Actor.create({ name: item.name, type: data.type, ownership: { default: 0 } });
    if (actor) this.#commit([{ op: "set", kind: "items", id, data: { uuid: actor.uuid } }]);
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
      this.#el(id)?.classList.add("mrp-threadsrc");
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
    const list = entries.filter(Boolean);
    const menu = document.createElement("div");
    menu.className = "mrp-menu";
    menu.setAttribute("role", "menu");
    menu.style.visibility = "hidden";
    for (const entry of list) {
      if (entry.separator) {
        menu.insertAdjacentHTML("beforeend", `<hr>`);
        continue;
      }
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
    this.#place(menu, event.clientX - rect.left, event.clientY - rect.top);
    menu.style.visibility = "";
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
    if (!this.#sel.has(id)) this.#select([id]);
    const ids = this.#selected();
    const edit = this.canEdit;
    const multi = ids.length > 1;
    const item = this.board.items[id];
    if (!item) return;
    const isRef = ["journal", "entity"].includes(item.type);
    const allHidden = ids.every((i) => this.board.items[i].hidden);
    const allPrivate = ids.every((i) => this.board.items[i].owner);
    this.#menu(event, [
      !multi && isRef && item.uuid && { icon: "fa-regular fa-folder-open", label: t("openDoc"), fn: () => this.#openRef(item) },
      !multi && game.user.isGM && item.type === "entity" && !item.uuid && { icon: "fa-solid fa-link", label: t("linkDoc"), fn: () => this.#linkFlyout(id) },
      !multi && game.user.isGM && item.type === "entity" && !item.uuid && (!item.kind || item.kind === "Actor") && { icon: "fa-solid fa-user-plus", label: t("createActor"), fn: () => this.#createActorFor(id) },
      !multi && game.user.isGM && item.type === "entity" && { icon: item.reveal ? "fa-solid fa-eye-slash" : "fa-solid fa-eye", label: t(item.reveal ? "unrevealEntity" : "revealEntity"), fn: () => this.#toggleReveal(id) },
      !multi && edit && item.type !== "mark" && !isRef && { icon: "fa-solid fa-i-cursor", label: t("editText"), fn: () => this.#startEdit(id, item.type === "clipping" ? "title" : "text") },
      !multi && edit && { icon: "fa-solid fa-sliders", label: t("editDetails"), fn: () => this.#edit(id) },
      edit && { icon: "fa-solid fa-thumbtack", label: t("decoration"), fn: () => this.#pinFlyout(this.#root.querySelector(".mrp-selbar button[data-act=pins]") ?? this.#root.querySelector("[data-act=pins]"), "selection") },
      !multi && edit && { icon: "fa-solid fa-bezier-curve", label: t("threadFrom"), fn: () => ((this.#threadMode = true), (this.#threadFrom = id), this.#select([]), this.#el(id)?.classList.add("mrp-threadsrc"), this.#hud()) },
      edit && { separator: true },
      edit && { icon: "fa-regular fa-clone", label: t(multi ? "duplicateSel" : "duplicate"), fn: () => this.#duplicate() },
      edit && { icon: "fa-solid fa-arrow-up-long", label: t("front"), fn: () => this.#reorder(true) },
      edit && { icon: "fa-solid fa-arrow-down-long", label: t("back"), fn: () => this.#reorder(false) },
      game.user.isGM && { icon: allHidden ? "fa-solid fa-eye" : "fa-solid fa-eye-slash", label: t(allHidden ? "reveal" : "hide"), fn: () => this.#toggleHidden() },
      edit && { icon: allPrivate ? "fa-solid fa-lock-open" : "fa-solid fa-lock", label: t(allPrivate ? "makePublic" : "makePrivate"), fn: () => this.#togglePrivate() },
      edit && { separator: true },
      edit && { icon: "fa-solid fa-trash", label: multi ? `${t("remove")} (${ids.length})` : t("remove"), danger: true, fn: () => this.#removeSel() },
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

  async #openRef(item) {
    if (!item.uuid) return ui.notifications.info(t("notLinkedYet"));
    const doc = await fromUuid(item.uuid);
    if (!doc || !(game.user.isGM || doc.testUserPermission(game.user, "OBSERVER"))) return ui.notifications.warn(t("noPermission"));
    if (doc.documentName === "JournalEntryPage") return doc.parent.sheet.render({ force: true, pageId: doc.id });
    return doc.sheet.render({ force: true });
  }

  /* ---------- accesibilidad ---------- */

  get #a11y() {
    return { ...DEFAULT_A11Y, ...(game.settings.get(ID, "a11y") ?? {}) };
  }

  #applyA11y() {
    const a = this.#a11y;
    const root = this.#root;
    root.classList.toggle("mrp-legible", a.legible);
    root.classList.toggle("mrp-hc", a.contrast);
    root.classList.toggle("mrp-calm", a.calm);
    root.classList.toggle("mrp-bigui", a.bigUi);
    root.style.setProperty("--tscale", String(a.scale));
    this.#sigs.clear();
    for (const box of root.querySelectorAll(".mrp-text")) box.style.fontSize = "";
    this.refresh();
  }

  /** Mensaje para lectores de pantalla. */
  #say(message) {
    const live = this.#root?.querySelector(".mrp-live");
    if (!live) return;
    live.textContent = "";
    setTimeout(() => (live.textContent = message), 40);
  }

  #a11yFlyout(anchor) {
    const a = this.#a11y;
    const check = (key, label) => `<label class="mrp-check"><input type="checkbox" data-a11y="${key}" ${a[key] ? "checked" : ""}> <span>${esc(t(label))}</span></label>`;
    this.#flyout(anchor, t("a11y"), `<div class="mrp-fly-section"><label for="mrp-scale">${esc(t("a11yScale"))}: <b class="mrp-scaleval">${Math.round(a.scale * 100)}%</b></label>
        <input id="mrp-scale" type="range" min="0.8" max="2" step="0.1" value="${a.scale}" data-a11y="scale"></div>
      ${check("legible", "a11yLegible")}${check("contrast", "a11yContrast")}${check("calm", "a11yCalm")}${check("bigUi", "a11yBigUi")}
      <p class="mrp-fly-note">${esc(t("a11yNote"))}</p>`, {
      side: "below",
      mount: (box) => {
        box.addEventListener("input", async (event) => {
          const key = event.target.dataset.a11y;
          if (!key) return;
          const value = event.target.type === "checkbox" ? event.target.checked : Number(event.target.value);
          if (key === "scale") box.querySelector(".mrp-scaleval").textContent = `${Math.round(value * 100)}%`;
          await game.settings.set(ID, "a11y", { ...this.#a11y, [key]: value });
          this.#applyA11y();
        });
      },
    });
  }

  /* ---------- desplegables ---------- */

  #closeFlyout() {
    this.#root?.querySelectorAll(".mrp-flyout").forEach((f) => f.remove());
    this.#flyoutKey = null;
  }

  /** Coloca un panel dentro de la ventana (coordenadas respecto a ella) compensando el `zoom` CSS de la interfaz grande. */
  #place(box, left, top) {
    const root = this.#root.getBoundingClientRect();
    const z = Number(getComputedStyle(box).zoom) || 1;
    const rect = box.getBoundingClientRect();
    const x = Math.max(8, Math.min(left, root.width - rect.width - 10));
    const y = Math.max(8, Math.min(top, root.height - rect.height - 10));
    box.style.left = `${x / z}px`;
    box.style.top = `${y / z}px`;
  }

  /** Panel flotante junto a un botón: al lado del dock (`right`) o bajo la barra superior (`below`). */
  #flyout(anchor, title, html, { side = "right", key = title, mount } = {}) {
    this.#closeFlyout();
    this.#closeMenu();
    const root = this.#root.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const box = document.createElement("div");
    box.className = "mrp-flyout";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", title);
    box.innerHTML = `<header><strong>${esc(title)}</strong><button type="button" data-fly="close" aria-label="${esc(t("close"))}"><i class="fa-solid fa-xmark"></i></button></header><div class="mrp-fly-body">${html}</div>`;
    this.#root.append(box);
    this.#place(box, side === "right" ? a.right - root.left + 10 : a.left - root.left, side === "right" ? a.top - root.top - 6 : a.bottom - root.top + 8);
    box.addEventListener("click", (event) => {
      if (event.target.closest('[data-fly="close"]')) this.#closeFlyout();
    });
    mount?.(box);
    this.#flyoutKey = key;
    box.querySelector("input, button.mrp-var, button:not([data-fly])")?.focus({ preventScroll: true });
    return box;
  }

  /** Variantes de cada tipo de pieza para el desplegable del dock. */
  #variants(tool) {
    const img = (folder, id) => `<img src="${asset(folder, id)}" alt="" loading="lazy">`;
    const list = (table) => table.map((e) => ({ id: e.id, name: e.name, group: e.group, thumb: img(e.folder, e.id) }));
    if (tool === "note") return NOTE_COLORS.map((c) => ({ id: c, name: c[0].toUpperCase() + c.slice(1), thumb: img("recortes", `postit-${c}`) }));
    if (tool === "clipping") return list(PAPERS.filter((p) => !BLOCKED_PAPERS.has(p.style)));
    if (tool === "photo") return list(FRAMES);
    if (tool === "stamp") return list(STAMPS);
    if (tool === "mark") return list(MARKS);
    return [];
  }

  #variantFlyout(tool, anchor) {
    const entries = this.#variants(tool);
    let group = null;
    const rows = entries.map((e) => {
      const head = e.group && e.group !== group ? `<h5 class="mrp-group">${esc(e.group)}</h5>` : "";
      group = e.group ?? group;
      return `${head}<button type="button" class="mrp-var" data-variant="${e.id}" aria-label="${esc(e.name)}"><span class="mrp-vthumb">${e.thumb}</span><em>${esc(e.name)}</em></button>`;
    });
    const random = `<button type="button" class="mrp-var mrp-var-random" data-variant="random" aria-label="${esc(t("random"))}"><span class="mrp-vthumb"><i class="fa-solid fa-dice"></i></span><em>${esc(t("random"))}</em></button>`;
    this.#flyout(anchor, t(tool), `<div class="mrp-vgrid">${random}${rows.join("")}</div><button type="button" class="mrp-fly-more" data-fly="more"><i class="fa-solid fa-sliders"></i> ${esc(t("moreOptions"))}</button>`, {
      key: tool,
      mount: (box) =>
        box.addEventListener("click", (event) => {
          const variant = event.target.closest("[data-variant]")?.dataset.variant;
          if (variant) return this.#quickCreate(tool, variant);
          if (event.target.closest('[data-fly="more"]')) {
            this.#closeFlyout();
            this.#createDetailed(tool);
          }
        }),
    });
  }

  /** Crea la pieza con la variante elegida, sin ventana, y deja el cursor para escribir directamente. */
  async #quickCreate(tool, variant) {
    const any = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const pickId = (arr) => (variant === "random" ? any(arr).id : variant);
    const base = { rot: Math.round((Math.random() * 2 - 1) * 5) };
    if (tool === "note") Object.assign(base, { type: "note", text: "", color: variant === "random" ? any(NOTE_COLORS) : variant });
    if (tool === "clipping") Object.assign(base, { type: "clipping", title: "", text: "", paper: pickId(PAPERS.filter((p) => !BLOCKED_PAPERS.has(p.style))) });
    if (tool === "photo") Object.assign(base, { type: "photo", src: "", text: "", frame: pickId(FRAMES) });
    if (tool === "stamp") Object.assign(base, { type: "stamp", kind: pickId(STAMPS), text: "" });
    if (tool === "mark") Object.assign(base, { type: "mark", kind: pickId(MARKS) });
    const point = this.#center();
    const w = widthOf(base);
    const id = uid();
    this.#closeFlyout();
    await this.#commit([{ op: "set", kind: "items", id, data: { ...base, x: Math.round(point.x - w / 2), y: Math.round(point.y - w / 2), z: this.#topZ() + 1 } }]);
    this.#select([id]);
    this.#say(t("created"));
    this.#afterRender(id, () => (tool === "photo" ? this.#chooseImage(id) : tool === "mark" ? null : this.#startEdit(id, tool === "clipping" ? "title" : "text")));
  }

  /** Espera a que la pieza recién creada exista en pantalla (llega con la actualización del diario). */
  #afterRender(id, fn, tries = 40) {
    if (this.#el(id)) return fn();
    if (tries > 0) setTimeout(() => this.#afterRender(id, fn, tries - 1), 50);
  }

  async #chooseImage(id) {
    const item = this.board.items[id];
    if (!item) return;
    const path = await pickImage(item.src ?? "");
    if (path) this.#commit([{ op: "set", kind: "items", id, data: { src: path } }]);
  }

  #docFlyout(anchor) {
    const readable = (doc) => game.user.isGM || doc.testUserPermission(game.user, "OBSERVER");
    const entries = [
      ...game.journal.filter((j) => readable(j) && !j.getFlag(ID, "board")).flatMap((j) => [{ group: t("journals"), label: j.name, uuid: j.uuid }, ...j.pages.filter(readable).map((p) => ({ group: t("journals"), label: `${j.name} › ${p.name}`, uuid: p.uuid }))]),
      ...game.actors.filter(readable).map((a) => ({ group: t("actors"), label: a.name, uuid: a.uuid })),
      ...(game.user.isGM ? game.scenes.map((s) => ({ group: t("scenes"), label: s.name, uuid: s.uuid })) : []),
      ...game.items.filter(readable).map((i) => ({ group: t("items"), label: i.name, uuid: i.uuid })),
    ];
    let group = null;
    const rows = entries.map((e) => {
      const head = e.group !== group ? `<h5 class="mrp-group">${esc(e.group)}</h5>` : "";
      group = e.group;
      return `${head}<button type="button" class="mrp-doc" data-uuid="${e.uuid}" data-q="${esc(e.label.toLowerCase())}"><i class="fa-regular fa-file-lines"></i> ${esc(e.label)}</button>`;
    });
    this.#flyout(anchor, t("pickDocument"), `<input type="search" class="mrp-search" placeholder="${esc(t("search"))}" aria-label="${esc(t("search"))}"><p class="mrp-fly-note">${esc(t("pickDocumentHint"))}</p><div class="mrp-doclist">${rows.join("") || `<p class="mrp-fly-note">${esc(t("noDocs"))}</p>`}</div>`, {
      key: "doc",
      mount: (box) => {
        box.querySelector(".mrp-search").addEventListener("input", (event) => {
          const q = event.target.value.trim().toLowerCase();
          box.querySelectorAll(".mrp-doc").forEach((b) => (b.hidden = Boolean(q) && !b.dataset.q.includes(q)));
        });
        box.addEventListener("click", (event) => {
          const uuid = event.target.closest("[data-uuid]")?.dataset.uuid;
          if (!uuid) return;
          this.#closeFlyout();
          this.#addRef(uuid, this.#center());
        });
      },
    });
  }

  /* ---------- sujeción: por defecto de la pizarra o de la selección ---------- */

  #pinPreset() {
    return { ...DEFAULT_PIN_PRESET, ...(this.board.pinPreset ?? {}) };
  }

  #pinLabel() {
    const p = this.#pinPreset();
    const pin = p.pin === "auto" ? t("auto") : p.pin === "none" ? t("none") : (TABLES.pin.get(p.pin)?.name ?? p.pin);
    const layout = p.layout === "auto" ? t("auto") : (PIN_LAYOUTS[p.layout]?.name ?? p.layout);
    return `${pin} · ${layout}`;
  }

  #pinFlyout(anchor, target) {
    const isBoard = target === "board";
    const ids = this.#selected();
    const first = this.board.items?.[ids[0]] ?? {};
    let cur = isBoard ? this.#pinPreset() : { pin: first.pin ?? "auto", color: first.pinColor ?? "", layout: first.pinLayout ?? "auto" };
    const origColor = isBoard ? "" : "orig";
    const tile = (attr, val, label, inner) => `<button type="button" class="mrp-var" data-${attr}="${val}" aria-label="${esc(label)}"><span class="mrp-vthumb">${inner}</span><em>${esc(label)}</em></button>`;
    const spots = (key) => PIN_LAYOUTS[key].pins.map((s) => `<circle cx="${4 + s.x * 26}" cy="${5 + s.y * 32}" r="3.2"/>`).join("");
    const pins = [tile("pin", "auto", t("auto"), `<i class="fa-solid fa-dice"></i>`), tile("pin", "none", t("none"), `<i class="fa-solid fa-ban"></i>`), ...PINS.map((p) => tile("pin", p.id, p.name, `<img src="${asset(p.folder, p.id)}" alt="">`))].join("");
    const layouts = [tile("layout", "auto", t("auto"), `<i class="fa-solid fa-dice"></i>`), ...Object.entries(PIN_LAYOUTS).map(([k, l]) => tile("layout", k, l.name, `<svg viewBox="0 0 34 42" aria-hidden="true"><rect x="4" y="5" width="26" height="32" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>${spots(k)}</svg>`))].join("");
    const swatches = [`<button type="button" class="mrp-colorbtn mrp-colorbtn-orig" data-color="${origColor}" aria-label="${esc(t("pinOriginal"))}" data-tooltip="${esc(t("pinOriginal"))}"><i class="fa-solid fa-droplet-slash"></i></button>`, ...PIN_COLORS.map((c) => `<button type="button" class="mrp-colorbtn" data-color="${c}" style="--c:${c}" aria-label="${c}"></button>`)].join("");
    const body = `<h5 class="mrp-group">${esc(t("decoration"))}</h5><div class="mrp-vgrid">${pins}</div>
      <h5 class="mrp-group">${esc(t("pinColor"))}</h5><div class="mrp-colors">${swatches}<input type="color" class="mrp-colorpick" value="#c0392b" aria-label="${esc(t("pinCustom"))}"></div>
      <h5 class="mrp-group">${esc(t("pinLayout"))}</h5><div class="mrp-vgrid mrp-layouts">${layouts}</div>
      <button type="button" class="mrp-fly-more" data-fly="${isBoard ? "applyAll" : "inherit"}"><i class="fa-solid fa-rotate-left"></i> ${esc(t(isBoard ? "pinApplyAll" : "pinInheritBoard"))}</button>`;
    const mark = (box) => {
      box.querySelectorAll("[data-pin]").forEach((b) => b.classList.toggle("on", b.dataset.pin === cur.pin));
      box.querySelectorAll("[data-layout]").forEach((b) => b.classList.toggle("on", b.dataset.layout === cur.layout));
      box.querySelectorAll("[data-color]").forEach((b) => b.classList.toggle("on", b.dataset.color === cur.color));
    };
    this.#flyout(anchor, t(isBoard ? "pinPreset" : "decoration"), body, {
      side: isBoard ? "below" : "right",
      key: `pin-${target}`,
      mount: (box) => {
        mark(box);
        const apply = (change) => {
          cur = { ...cur, ...change };
          mark(box);
          if (isBoard) return this.#commit([{ op: "set", kind: "settings", id: uid(), data: { pinPreset: cur } }]);
          const data = { pin: cur.pin, pinLayout: cur.layout, pinColor: cur.color };
          return this.#commit(this.#selected().filter((id) => ["note", "clipping", "photo", "journal", "entity"].includes(this.board.items[id].type)).map((id) => ({ op: "set", kind: "items", id, data })));
        };
        box.addEventListener("click", async (event) => {
          const b = event.target.closest("button");
          if (!b) return;
          if (b.dataset.pin !== undefined) apply({ pin: b.dataset.pin });
          else if (b.dataset.layout !== undefined) apply({ layout: b.dataset.layout });
          else if (b.dataset.color !== undefined) apply({ color: b.dataset.color });
          else if (b.dataset.fly === "applyAll") {
            const ids = Object.entries(this.board.items ?? {}).filter(([, i]) => ["note", "clipping", "photo", "journal", "entity"].includes(i.type)).map(([id]) => id);
            this.#commit(ids.map((id) => ({ op: "set", kind: "items", id, data: { pin: "auto", pinLayout: "auto", pinColor: "" } })));
          } else if (b.dataset.fly === "inherit") {
            cur = { pin: "auto", color: "", layout: "auto" };
            mark(box);
            this.#commit(this.#selected().map((id) => ({ op: "set", kind: "items", id, data: { pin: "auto", pinLayout: "auto", pinColor: "" } })));
          }
        });
        box.querySelector(".mrp-colorpick").addEventListener("input", (event) => apply({ color: event.target.value }));
      },
    });
  }

  /* ---------- edición directa sobre la pieza ---------- */

  #startEdit(id, name) {
    const item = this.board.items?.[id];
    const el = this.#el(id);
    const target = el?.querySelector(`[data-field="${name}"]`);
    if (!item || !target || !this.canEdit) return;
    const single = name !== "text" || item.type !== "clipping";
    const original = item[name] ?? "";
    let cancelled = false;
    el.classList.add("mrp-editing");
    target.contentEditable = "plaintext-only";
    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false); // cursor al final: corregir un texto no lo reemplaza
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // textContent y no innerText: este aplica text-transform y guardaría el titular en mayúsculas
    const clean = () => target.textContent.replaceAll("\u00a0", " ").replace(/\n+$/, "");
    const onKey = (event) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        cancelled = true;
        target.blur();
      } else if (event.key === "Enter" && (single || event.ctrlKey || event.metaKey) && !event.shiftKey) {
        event.preventDefault();
        target.blur();
      }
    };
    const onInput = () => fitText(el);
    target.addEventListener("keydown", onKey);
    target.addEventListener("input", onInput);
    target.addEventListener("blur", () => {
      target.removeEventListener("keydown", onKey);
      target.removeEventListener("input", onInput);
      target.contentEditable = "false";
      el.classList.remove("mrp-editing");
      const value = clean();
      if (cancelled) target.textContent = original;
      else if (value !== original) this.#commit([{ op: "set", kind: "items", id, data: { [name]: value } }]);
      this.#root?.focus({ preventScroll: true });
    }, { once: true });
  }

  #dblclick(id, event) {
    const item = this.board.items?.[id];
    if (!item) return;
    if (item.type === "entity" && !item.uuid && game.user.isGM) return this.#linkFlyout(id);
    if (["journal", "entity"].includes(item.type)) return this.#openRef(item);
    if (!this.canEdit || this.#threadMode) return;
    const name = event.target.closest?.("[data-field]")?.dataset.field;
    if (item.type === "photo" && !name) return this.#chooseImage(id);
    if (item.type === "mark") return this.#edit(id);
    this.#startEdit(id, name ?? "text");
  }

  /* ---------- teclado ---------- */

  #key(event) {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) || event.target.isContentEditable) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (event.code === "Space") {
      event.preventDefault();
      if (!this.#space) {
        this.#space = true;
        this.#modeClass();
      }
    } else if (event.key === "Escape") {
      this.#closeMenu();
      this.#closeFlyout();
      this.#root.querySelector(".mrp-help").hidden = true;
      if (this.#threadMode) this.#tool("select");
      else this.#select([]);
    } else if ((event.key === "Delete" || event.key === "Backspace") && this.#sel.size && this.canEdit) {
      event.preventDefault();
      this.#removeSel();
    } else if (mod && key === "z" && this.canEdit) {
      event.preventDefault();
      this.#undo();
    } else if (mod && key === "a") {
      event.preventDefault();
      this.#select(this.#allIds().filter((id) => this.#snaps([id]).length));
    } else if (mod && key === "d" && this.canEdit) {
      event.preventDefault();
      this.#duplicate();
    } else if (event.key.startsWith("Arrow") && this.#sel.size && this.canEdit) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = { ArrowLeft: -step, ArrowRight: step }[event.key] ?? 0;
      const dy = { ArrowUp: -step, ArrowDown: step }[event.key] ?? 0;
      this.#commit(this.#selected().map((id) => ({ op: "set", kind: "items", id, data: { x: this.board.items[id].x + dx, y: this.board.items[id].y + dy } })));
    } else if (!mod && key === "v") this.#tool("select");
    else if (!mod && key === "h") this.#tool("hand");
    else if (!mod && key === "t" && this.canEdit) this.#tool("thread");
    else if (event.key === "Enter" && event.target.classList.contains("mrp-item")) {
      const id = event.target.dataset.id;
      if (this.#threadMode) this.#threadPick(id);
      else this.#dblclick(id, { target: event.target });
    }
  }
}
