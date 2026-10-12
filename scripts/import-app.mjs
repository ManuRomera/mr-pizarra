/**
 * Ventana de importación: 1) el prompt para dárselo a una IA con la aventura, 2) pegar su respuesta y revisarla,
 * 3) importar (a esta pizarra, reemplazándola o en una pizarra nueva). Lo que no exista todavía en el mundo
 * (actores, escenas, objetos) queda como ficha «sin vincular» para enlazarla después.
 */
import { ID, BOARD, planOps } from "./rules.mjs";
import { buildPrompt, parseImport, normalizeImport } from "./import.mjs";
import { t, esc, uid } from "./util.mjs";
import { boardData, sendOps } from "./board-sheet.mjs";

const SOURCES = { Actor: () => game.actors, Scene: () => game.scenes, Item: () => game.items, RollTable: () => game.tables };

/** Índice nombre → documentos del mundo, por tipo, para vincular fichas por nombre exacto. */
function nameIndex() {
  const index = {};
  for (const [kind, get] of Object.entries(SOURCES)) {
    index[kind] = new Map();
    for (const doc of get()?.contents ?? []) {
      const key = doc.name.trim().toLowerCase();
      index[kind].set(key, [...(index[kind].get(key) ?? []), doc]);
    }
  }
  return index;
}

/** Documento del mundo que corresponde a una ficha por nombre (y tipo si lo trae); `ambiguous` si hay varios. */
function findDoc(index, name, kind) {
  const key = name.trim().toLowerCase();
  const kinds = kind ? [kind] : ["Actor", "Scene", "Item", "RollTable"];
  const hits = kinds.flatMap((k) => index[k]?.get(key) ?? []);
  return { doc: hits.length === 1 ? hits[0] : null, ambiguous: hits.length > 1 };
}

const paragraphs = (text) => String(text ?? "").split(/\n\s*\n/).map((p) => `<p>${foundry.utils.escapeHTML(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");

export class ImportApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "mr-pizarra-import",
    classes: ["mrp-window", "mrp-import"],
    position: { width: 900, height: 780 },
    window: { icon: "fa-solid fa-file-import", resizable: true, contentClasses: ["mrp-importbody"] },
  };

  #root = null;
  #result = null;
  #createBoard;

  /** @param {{doc?:JournalEntry|null, createBoard:Function}} options  `doc`: pizarra abierta (si no hay, solo se puede crear una nueva). */
  constructor({ doc = null, createBoard, ...options } = {}) {
    super(options);
    this.doc = doc;
    this.#createBoard = createBoard;
  }

  get title() {
    return t("importTitle");
  }

  async _renderHTML() {
    return null;
  }

  _replaceHTML(result, content) {
    if (!content.querySelector(".mrp-imp")) this.#build(content);
  }

  #build(content) {
    const targets = [
      ...(this.doc ? [["add", "importAdd"], ["replace", "importReplace"]] : []),
      ["new", "importNew"],
    ];
    content.innerHTML = `<div class="mrp-imp">
      <section class="mrp-step"><h3><span>1</span> ${esc(t("impStep1"))}</h3>
        <fieldset class="mrp-modes"><legend>${esc(t("impMode"))}</legend>
          <label class="mrp-mode"><input type="radio" name="mode" value="board" checked><span><strong>${esc(t("impModeBoard"))}</strong><small>${esc(t("impModeBoardHint"))}</small></span></label>
          <label class="mrp-mode"><input type="radio" name="mode" value="box"><span><strong>${esc(t("impModeBox"))}</strong><small>${esc(t("impModeBoxHint"))}</small></span></label>
        </fieldset>
        <p>${esc(t("impStep1Text"))}</p>
        <div class="mrp-imp-actions">
          <button type="button" class="mrp-btn primary" data-imp="copy"><i class="fa-regular fa-copy"></i> ${esc(t("impCopy"))}</button>
          <button type="button" class="mrp-btn" data-imp="download"><i class="fa-solid fa-download"></i> ${esc(t("impDownload"))}</button>
          <button type="button" class="mrp-btn" data-imp="toggle"><i class="fa-regular fa-eye"></i> <span>${esc(t("impShow"))}</span></button>
        </div>
        <textarea class="mrp-prompt" readonly hidden aria-label="${esc(t("impStep1"))}"></textarea>
        <p class="mrp-fly-note">${esc(t("impStep1Tip"))}</p>
      </section>
      <section class="mrp-step"><h3><span>2</span> ${esc(t("impStep2"))}</h3>
        <textarea class="mrp-paste" rows="9" placeholder="${esc(t("impPaste"))}" aria-label="${esc(t("impStep2"))}"></textarea>
        <div class="mrp-imp-actions">
          <button type="button" class="mrp-btn" data-imp="file"><i class="fa-solid fa-file-arrow-up"></i> ${esc(t("impFile"))}</button>
          <input type="file" accept=".json,.txt,.md,application/json,text/plain" hidden>
          <button type="button" class="mrp-btn primary" data-imp="validate"><i class="fa-solid fa-list-check"></i> ${esc(t("impReview"))}</button>
        </div>
        <div class="mrp-report" role="status" aria-live="polite"></div>
      </section>
      <section class="mrp-step"><h3><span>3</span> ${esc(t("impStep3"))}</h3>
        <div class="mrp-imp-opts">
          <fieldset><legend>${esc(t("impPlace"))}</legend>
            <label class="mrp-check"><input type="radio" name="place" value="board" checked> <span>${esc(t("impPlaceBoard"))}</span></label>
            <label class="mrp-check"><input type="radio" name="place" value="box"> <span>${esc(t("impPlaceBox"))}</span></label>
          </fieldset>
          <fieldset><legend>${esc(t("impTarget"))}</legend>${targets.map(([v, k], i) => `<label class="mrp-check"><input type="radio" name="target" value="${v}" ${i === 0 ? "checked" : ""}> <span>${esc(t(k))}</span></label>`).join("")}</fieldset>
          <fieldset><legend>${esc(t("impOptions"))}</legend>
            <label class="mrp-check"><input type="checkbox" name="link" checked> <span>${esc(t("impLink"))}</span></label>
            <label class="mrp-check"><input type="checkbox" name="journals" checked> <span>${esc(t("impJournals"))}</span></label>
            <label class="mrp-check"><input type="checkbox" name="style" checked> <span>${esc(t("impStyle"))}</span></label>
          </fieldset>
        </div>
        <div class="mrp-imp-actions"><button type="button" class="mrp-btn primary big" data-imp="import" disabled><i class="fa-solid fa-file-import"></i> ${esc(t("impRun"))}</button></div>
      </section></div>`;
    this.#root = content.querySelector(".mrp-imp");
    this.#root.querySelector(".mrp-prompt").value = buildPrompt({ mode: this.#promptMode() });
    this.#root.querySelectorAll("[name=mode]").forEach((r) => r.addEventListener("change", () => (this.#root.querySelector(".mrp-prompt").value = buildPrompt({ mode: this.#promptMode() }))));
    this.#root.addEventListener("click", (event) => {
      const act = event.target.closest("[data-imp]")?.dataset.imp;
      if (act === "copy") this.#copy();
      else if (act === "download") this.#download();
      else if (act === "toggle") this.#toggle();
      else if (act === "file") this.#root.querySelector("input[type=file]").click();
      else if (act === "validate") this.#validate();
      else if (act === "import") this.#run();
    });
    this.#root.querySelector("input[type=file]").addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      this.#root.querySelector(".mrp-paste").value = await file.text();
      this.#validate();
    });
    this.#root.querySelector(".mrp-paste").addEventListener("input", () => {
      this.#result = null;
      this.#root.querySelector("[data-imp=import]").disabled = true;
    });
  }

  #promptMode() {
    return this.#root.querySelector("[name=mode]:checked")?.value ?? "board";
  }

  async #copy() {
    const text = buildPrompt({ mode: this.#promptMode() });
    try {
      await navigator.clipboard.writeText(text);
      ui.notifications.info(t("impCopied"));
    } catch {
      const area = this.#root.querySelector(".mrp-prompt");
      area.hidden = false;
      area.select();
      ui.notifications.warn(t("impCopyFail"));
    }
  }

  #download() {
    const url = URL.createObjectURL(new Blob([buildPrompt({ mode: this.#promptMode() })], { type: "text/markdown" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `mr-pizarra-prompt-${this.#promptMode()}.md` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  #toggle() {
    const area = this.#root.querySelector(".mrp-prompt");
    area.hidden = !area.hidden;
    this.#root.querySelector("[data-imp=toggle] span").textContent = t(area.hidden ? "impShow" : "impHide");
  }

  #options() {
    const q = (n) => this.#root.querySelector(`[name=${n}]`);
    return { place: this.#root.querySelector("[name=place]:checked")?.value ?? "board", target: this.#root.querySelector("[name=target]:checked")?.value ?? "new", link: q("link").checked, journals: q("journals").checked, style: q("style").checked };
  }

  /** Revisa la respuesta pegada y enseña qué se va a importar y qué problemas tiene. */
  #validate() {
    const report = this.#root.querySelector(".mrp-report");
    this.#result = null;
    this.#root.querySelector("[data-imp=import]").disabled = true;
    let result;
    try {
      result = normalizeImport(parseImport(this.#root.querySelector(".mrp-paste").value));
    } catch (error) {
      report.innerHTML = `<p class="mrp-issue error"><i class="fa-solid fa-circle-xmark"></i> ${esc(error.message)}</p>`;
      return;
    }
    const index = nameIndex();
    const linked = [];
    const unlinked = [];
    const ambiguous = [];
    for (const it of result.items.filter((i) => i.type === "entity")) {
      const hit = findDoc(index, it.data.name, it.data.kind);
      if (hit.doc) linked.push(it.data.name);
      else (hit.ambiguous ? ambiguous : unlinked).push(it.data.name);
    }
    const s = result.stats;
    const byType = Object.entries(s.byType ?? {}).map(([k, n]) => `${n} ${t(k)}`).join(" · ");
    const errors = result.issues.filter((i) => i.level === "error");
    const warns = result.issues.filter((i) => i.level === "aviso");
    const li = (i) => `<li class="mrp-issue ${i.level === "error" ? "error" : "warn"}"><i class="fa-solid ${i.level === "error" ? "fa-circle-xmark" : "fa-triangle-exclamation"}"></i> <b>${esc(i.where)}</b>: ${esc(i.message)}</li>`;
    report.innerHTML = `<div class="mrp-summary"><strong>${esc(result.title || t("importNew"))}</strong>
      <span>${s.items} ${t("pieceMany")} · ${s.links} ${t("threadMany")} · ${s.layers} ${t("impLayersWord")} · ${s.hidden} ${t("impHiddenWord")}</span><span>${esc(byType)}</span>${s.groups?.length ? `<span>${esc(s.groups.join(" · "))}</span>` : ""}</div>
      ${s.pending ? `<p class="mrp-linkinfo"><i class="fa-solid fa-link"></i> ${linked.length} ${t("impWillLink")}${linked.length ? ` (${esc(linked.slice(0, 6).join(", "))}${linked.length > 6 ? "…" : ""})` : ""}.
        <i class="fa-solid fa-link-slash"></i> ${unlinked.length + ambiguous.length} ${t("impWillPend")}${unlinked.length ? ` (${esc(unlinked.slice(0, 6).join(", "))}${unlinked.length > 6 ? "…" : ""})` : ""}${ambiguous.length ? `; ${ambiguous.length} ${t("impAmbiguous")}` : ""}.</p>` : ""}
      ${errors.length ? `<details open><summary>${errors.length} ${t("impErrors")}</summary><ul>${errors.map(li).join("")}</ul></details>` : ""}
      ${warns.length ? `<details><summary>${warns.length} ${t("impWarnings")}</summary><ul>${warns.map(li).join("")}</ul></details>` : ""}`;
    if (!result.items.length) return;
    this.#result = result;
    this.#root.querySelector(`[name=place][value=${result.mode}]`).checked = true;
    this.#root.querySelector("[data-imp=import]").disabled = false;
  }

  /** Importa: vincula por nombre, crea los diarios, valida cada operación por separado y envía lo válido. */
  async #run() {
    const result = this.#result;
    if (!result) return;
    const opts = this.#options();
    let doc = this.doc;
    try {
      if (opts.target === "new" || !doc) doc = await this.#createBoard(result.title || t("importNew"), { background: result.background ?? "corcho-claro", share: true, open: false });
      if (!doc) return;
      const board = boardData(doc);
      const index = opts.link ? nameIndex() : null;
      const ids = new Map(result.items.map((it) => [it.ref, uid()]));
      const inBox = opts.place === "box";
      const layerIds = new Map(result.layers.map((l) => [l.ref, uid()]));
      let z = opts.target === "replace" ? 0 : Math.max(0, ...Object.values(board.items ?? {}).map((i) => i.z ?? 0));
      let folder = null;
      const ops = [];
      if (opts.target === "replace") {
        for (const id of Object.keys(board.items ?? {})) ops.push({ op: "remove", kind: "items", id });
        for (const id of Object.keys(board.layers ?? {})) ops.push({ op: "remove", kind: "layers", id });
      }
      result.layers.forEach((l, i) => ops.push({ op: "set", kind: "layers", id: layerIds.get(l.ref), data: { name: l.name, color: l.color, revealed: l.revealed, order: Object.keys(board.layers ?? {}).length + i } }));
      let slot = 0;
      const notes = { pending: [], journals: 0, linked: 0 };
      for (const it of result.items) {
        const data = { ...it.data };
        z += 1;
        data.z = z;
        if (it.layerRef) data.layer = layerIds.get(it.layerRef);
        if (inBox) data.box = true;
        else if (data.x === undefined || data.y === undefined) {
          // una caja que se coloca en la pizarra: cuadrícula inicial para poder recolocar a mano
          data.x ??= 150 + (slot % 8) * 380;
          data.y ??= 150 + Math.floor(slot / 8) * 420;
          slot += 1;
        }
        if (it.type === "entity") {
          const hit = index ? findDoc(index, data.name, data.kind) : { doc: null };
          if (hit.doc) {
            data.uuid = hit.doc.uuid;
            notes.linked += 1;
          } else notes.pending.push(data.name);
          if (it.showToAll) data.reveal = hit.doc ? { name: hit.doc.name, img: hit.doc.img && /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(hit.doc.img) ? hit.doc.img : "" } : { name: data.name, img: data.img ?? "" };
        } else if (it.type === "journal") {
          if (opts.journals) {
            folder ??= await Folder.create({ name: `${t("impFolder")} · ${doc.name}`, type: "JournalEntry" });
            const entry = await JournalEntry.create({ name: data.title, folder: folder.id, ownership: { default: 0 }, pages: [{ name: data.title, type: "text", text: { content: paragraphs(it.journalText), format: 1 } }] });
            data.uuid = entry.uuid;
            delete data.title;
            notes.journals += 1;
          } else {
            // sin crear diarios: el documento pasa a ser un recorte con su texto
            Object.assign(data, { type: "clipping", text: (it.journalText ?? "").slice(0, BOARD.textMax), paper: "papel-viejo-1" });
          }
        }
        ops.push({ op: "set", kind: "items", id: ids.get(it.ref), data });
      }
      for (const link of inBox ? [] : result.links) ops.push({ op: "set", kind: "links", id: uid(), data: { from: ids.get(link.from), to: ids.get(link.to), color: link.color, style: link.style, label: link.label } });
      if (opts.style) {
        const data = {};
        if (result.background) data.background = result.background;
        if (result.pinPreset) data.pinPreset = result.pinPreset;
        if (Object.keys(data).length) ops.push({ op: "set", kind: "settings", id: uid(), data });
      }
      // se valida pieza a pieza con las mismas reglas que la hoja: lo que no pasa se omite y se cuenta
      const ctx = { isGM: true, userId: game.user.id };
      let working = boardData(doc);
      const valid = [];
      const skipped = [];
      for (const op of ops) {
        try {
          working = planOps(working, [op], ctx).board;
          valid.push(op);
        } catch (error) {
          skipped.push(`${op.kind === "items" ? (op.data?.name ?? op.data?.title ?? op.data?.text ?? op.id) : op.kind}: ${error.message}`);
        }
      }
      for (let i = 0; i < valid.length; i += BOARD.batch) await sendOps(doc, valid.slice(i, i + BOARD.batch));
      const created = valid.filter((o) => o.kind === "items" && o.op === "set").length;
      let message = `${created} ${t("pieceMany")} ${t("impDone")}`;
      if (notes.journals) message += ` · ${notes.journals} ${t("impJournalsMade")}`;
      if (notes.linked) message += ` · ${notes.linked} ${t("impLinked")}`;
      ui.notifications.info(message);
      if (notes.pending.length) ui.notifications.warn(`${notes.pending.length} ${t("impPendingWarn")}`, { permanent: true });
      if (skipped.length) {
        console.warn(`${ID} | importación: omitido`, skipped);
        ui.notifications.warn(`${skipped.length} ${t("impSkipped")}`);
      }
      doc.sheet.render({ force: true });
      this.close();
    } catch (error) {
      console.error(error);
      ui.notifications.error(`${t("impFailed")}: ${error.message}`);
    }
  }
}
