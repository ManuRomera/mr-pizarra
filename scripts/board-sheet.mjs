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

  /* ---------- construcción de la interfaz ---------- */

  #build(content) {
    const btn = ([name, icon, label, key]) =>
      `<button type="button" class="mrp-tool" data-tool="${name}" data-tooltip="${esc(t(label))}${key ? ` · ${key}` : ""}" data-tooltip-direction="RIGHT" aria-label="${esc(t(label))}"><i class="${icon}"></i></button>`;
    const rail = TOOLS.map((g) => `<div class="mrp-tools" data-group="${g.group}">${g.items.map(btn).join("")}</div>`).join("");
    content.innerHTML = `<div class="mrp-root" tabindex="-1">
      <nav class="mrp-rail" aria-label="${esc(t("title"))}">${rail}</nav>
      <div class="mrp-main">
        <header class="mrp-topbar">
          <div class="mrp-title"><span class="mrp-badge-logo"><i class="fa-solid fa-thumbtack"></i></span><div><strong class="mrp-name"></strong><small class="mrp-meta"></small></div></div>
          <div class="mrp-chips">
            <button type="button" class="mrp-chip" data-act="bg"><i class="fa-solid fa-palette"></i><span class="mrp-bgname"></span></button>
            ${game.user.isGM ? `<button type="button" class="mrp-chip" data-act="lock"><i class="fa-solid fa-lock-open"></i><span>${esc(t("lock"))}</span></button>` : ""}
            <button type="button" class="mrp-chip mrp-chip-icon" data-act="help" data-tooltip="${esc(t("help"))}" aria-label="${esc(t("help"))}"><i class="fa-regular fa-circle-question"></i></button>
          </div>
        </header>
        <div class="mrp-viewport">
          <div class="mrp-world" style="width:${BOARD.width}px;height:${BOARD.height}px">
            <div class="mrp-surface"></div><svg class="mrp-threads" width="${BOARD.width}" height="${BOARD.height}" aria-hidden="true"></svg>
            <div class="mrp-items"></div>
            <div class="mrp-sel" hidden><span class="mrp-h" data-h="nw"></span><span class="mrp-h" data-h="ne"></span><span class="mrp-h" data-h="se"></span><span class="mrp-h" data-h="sw"></span><span class="mrp-stem"></span><span class="mrp-h mrp-h-rot" data-h="rot"><i class="fa-solid fa-rotate"></i></span></div>
          </div>
          <div class="mrp-marquee" hidden></div>
          <div class="mrp-hud" role="status"></div>
          <div class="mrp-hint"><i class="fa-regular fa-hand-pointer"></i> ${esc(t("empty"))}</div>
          <div class="mrp-selbar" hidden></div>
          <div class="mrp-zoombar"><button type="button" data-act="out" aria-label="${esc(t("zoomOut"))}" data-tooltip="${esc(t("zoomOut"))}"><i class="fa-solid fa-minus"></i></button><button type="button" class="mrp-zoomval" data-act="zoom100" data-tooltip="100%">70%</button><button type="button" data-act="in" aria-label="${esc(t("zoomIn"))}" data-tooltip="${esc(t("zoomIn"))}"><i class="fa-solid fa-plus"></i></button><button type="button" data-act="fit" aria-label="${esc(t("fit"))}" data-tooltip="${esc(t("fit"))}"><i class="fa-solid fa-expand"></i></button></div>
          <canvas class="mrp-minimap" width="220" height="138" aria-hidden="true"></canvas>
          <div class="mrp-help" hidden>${this.#helpHTML()}</div>
        </div>
      </div></div>`;
    this.#root = content.querySelector(".mrp-root");
    this.#listen();
  }

  #helpHTML() {
    const rows = ["helpSelect", "helpMulti", "helpMove", "helpScale", "helpRotate", "helpPan", "helpDelete", "helpUndo", "helpDuplicate", "helpThread"].map((k) => `<li>${t(k)}</li>`).join("");
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
      if (id) this.#activate(id);
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

  #act(act, event) {
    const rect = this.#root.querySelector(".mrp-viewport").getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (act === "in") this.#zoomAt(1.25, cx, cy);
    else if (act === "out") this.#zoomAt(0.8, cx, cy);
    else if (act === "fit") this.#fit();
    else if (act === "zoom100") this.#zoomAt(1 / this.#view.k, cx, cy);
    else if (act === "bg") this.#tool("bg");
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
    this.#drawThreads();
    this.#drawSel();
    this.#schedule();
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
      ${b("dup", "fa-regular fa-clone", "duplicate")}${b("front", "fa-solid fa-arrow-up-long", "front")}${b("back", "fa-solid fa-arrow-down-long", "back")}
      ${game.user.isGM ? b("hide", "fa-solid fa-eye-slash", "hideToggle") : ""}${sep}${b("del", "fa-solid fa-trash", "remove", 'class="danger"')}`;
  }

  #selbarAct(act, event) {
    if (act === "rot-") return this.#rotateSel(-15);
    if (act === "rot+") return this.#rotateSel(15);
    if (act === "scale-") return this.#scaleSel(0.9);
    if (act === "scale+") return this.#scaleSel(1.1);
    if (act === "align") return this.#alignMenu(event);
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
  }

  /* ---------- hilos ---------- */

  #anchor(el, id) {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pv = this.#preview.get(id);
    const f = pv?.f ?? 1;
    const ox = (w * Number(el.dataset.fx) + Number(el.dataset.pinx) - w / 2) * f;
    const oy = (Number(el.dataset.pint) - h / 2) * f;
    const p = rotate(ox, oy, (Number(el.dataset.rot) || 0) + (pv?.th ?? 0));
    return { x: (pv?.cx ?? el.offsetLeft + w / 2) + p.x, y: (pv?.cy ?? el.offsetTop + h / 2) + p.y };
  }

  #drawThreads() {
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
    if (event.button === 2) return;
    this.#closeMenu();
    this.#root.focus({ preventScroll: true });
    if (event.target.closest(".mrp-minimap")) return this.#track(event, (e) => this.#minimapPoint(e), () => {}, () => this.#minimapPoint(event));
    if (event.target.closest(".mrp-hud, .mrp-selbar, .mrp-zoombar, .mrp-help, .mrp-menu")) return;
    const handle = event.target.closest(".mrp-h");
    if (handle && this.canEdit) return this.#startTransform(event, handle.dataset.h);
    const itemEl = event.target.closest(".mrp-item");
    const threadEl = event.target.closest(".mrp-thread");
    const pan = event.button === 1 || this.#mode === "hand" || this.#space;
    if (threadEl && !itemEl && event.button === 0 && !pan) return this.#threadMenu(threadEl.dataset.link, event);
    if (pan) return this.#startPan(event);
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

  #startPan(event) {
    const base = { x: this.#view.x, y: this.#view.y };
    this.#root.classList.add("mrp-panning");
    this.#track(event, (e, s) => {
      this.#view.x = base.x + e.clientX - s.x;
      this.#view.y = base.y + e.clientY - s.y;
      this.#applyView();
    }, () => this.#root.classList.remove("mrp-panning"), () => {
      this.#root.classList.remove("mrp-panning");
      if (!this.#threadMode) this.#select([]);
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
    const w = widthOf({ type });
    return this.#commit([{ op: "set", kind: "items", id: uid(), data: { type, uuid, x: Math.round(point.x - w / 2), y: Math.round(point.y - w / 2), z: this.#topZ() + 1 } }]);
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
    menu.style.left = `${Math.max(8, Math.min(event.clientX - rect.left, rect.width - 260))}px`;
    menu.style.top = `${Math.max(8, Math.min(event.clientY - rect.top, rect.height - list.length * 36 - 14))}px`;
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
      !multi && isRef && { icon: "fa-regular fa-folder-open", label: t("openDoc"), fn: () => this.#openRef(item) },
      !multi && edit && { icon: "fa-solid fa-pen", label: t("edit"), fn: () => this.#edit(id) },
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

  /* ---------- teclado ---------- */

  #key(event) {
    if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)) return;
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
    else if (event.key === "Enter" && event.target.classList.contains("mrp-item")) this.#activate(event.target.dataset.id);
  }
}
