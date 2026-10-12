/**
 * MR- Pizarra: pizarra de investigación colaborativa, independiente del sistema de juego.
 * Cada pizarra es un JournalEntry con una hoja propia (los permisos son los del diario); los datos
 * viven en `flags.mr-pizarra.board`.
 */
import { ID, FLAG, BACKGROUNDS } from "./rules.mjs";
import { BoardSheet, registerSocket } from "./board-sheet.mjs";
import { ImportApp } from "./import-app.mjs";
import { loadManifest, t, esc } from "./util.mjs";

const SHEET = `${ID}.BoardSheet`;
const OBSERVER = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;

/** Crea un diario-pizarra y lo abre. */
export async function createBoard(name, { background = "corcho-claro", share = false, open = true } = {}) {
  const doc = await JournalEntry.create({
    name: name || t("newBoardName"),
    ownership: { default: share ? OBSERVER() : 0 },
    flags: { core: { sheetClass: SHEET }, [ID]: { board: { background, items: {}, links: {}, locked: false } } },
  });
  if (open) doc?.sheet.render({ force: true });
  return doc;
}

/** Convierte un diario existente en pizarra (sus páginas siguen ahí). */
export async function convertToBoard(doc) {
  if (doc.getFlag(ID, "board")) return doc.sheet.render({ force: true });
  await doc.update({ "flags.core.sheetClass": SHEET, [FLAG]: { background: "corcho-claro", items: {}, links: {}, locked: false } });
  ui.notifications.info(t("convertDone"));
  return doc.sheet.render({ force: true });
}

async function askNewBoard() {
  const groups = Object.entries(Object.groupBy(BACKGROUNDS, (b) => b.group)).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map((b) => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</optgroup>`).join("");
  const data = await foundry.applications.api.DialogV2.input({
    window: { title: t("newBoard"), icon: "fa-solid fa-thumbtack" },
    position: { width: 440 },
    content: `<div class="form-group"><label>${t("boardName")}</label><div class="form-fields"><input type="text" name="name" value="${t("newBoardName")}" autofocus></div></div>
      <div class="form-group"><label>${t("background")}</label><div class="form-fields"><select name="background">${groups}</select></div></div>
      <div class="form-group"><label class="checkbox"><input type="checkbox" name="share" checked> ${t("shareWithPlayers")}</label></div>`,
    ok: { label: t("create"), icon: "fa-solid fa-check" },
    rejectClose: false,
  });
  if (data) return createBoard(data.name, { background: data.background, share: data.share });
}

Hooks.once("init", () => {
  // Preferencias de accesibilidad de cada navegador (tamaño de texto, letra legible, contraste, movimiento, interfaz grande)
  game.settings.register(ID, "a11y", { scope: "client", config: false, type: Object, default: { scale: 1, legible: false, contrast: false, calm: false, bigUi: false } });
  foundry.applications.apps.DocumentSheetConfig.registerSheet(JournalEntry, ID, BoardSheet, { label: "MR- Pizarra", makeDefault: false });
});

Hooks.once("ready", async () => {
  await loadManifest();
  registerSocket();
  game.modules.get(ID).api = {
    createBoard,
    convertToBoard,
    /** Abre la ventana de importación de una pizarra (de una IA o de un archivo); sin pizarra, crea una nueva. */
    importBoard: (doc = null) => new ImportApp({ doc, createBoard }).render({ force: true }),
    /** Abre una pizarra por id, nombre o documento. */
    open(ref) {
      const doc = typeof ref === "string" ? (game.journal.get(ref) ?? game.journal.getName(ref)) : ref;
      if (!doc?.getFlag(ID, "board")) throw Error("No es una pizarra de MR- Pizarra.");
      return doc.sheet.render({ force: true });
    },
  };
});

Hooks.on("renderJournalDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html[0];
  root.querySelectorAll(".mrp-new").forEach((el) => el.remove());
  if (JournalEntry.canUserCreate(game.user)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mrp-new";
    button.innerHTML = `<i class="fa-solid fa-thumbtack"></i> ${t("newBoard")}`;
    button.addEventListener("click", askNewBoard);
    const host = root.querySelector(".header-actions") ?? root.querySelector(".directory-header");
    host?.append(button);
    if (game.user.isGM) {
      const imp = document.createElement("button");
      imp.type = "button";
      imp.className = "mrp-new";
      imp.innerHTML = `<i class="fa-solid fa-file-import"></i> ${t("importShort")}`;
      imp.addEventListener("click", () => game.modules.get(ID).api.importBoard(null));
      host?.append(imp);
    }
  }
  for (const li of root.querySelectorAll(".directory-item[data-entry-id]")) {
    if (!game.journal.get(li.dataset.entryId)?.getFlag(ID, "board") || li.querySelector(".mrp-dir-icon")) continue;
    li.querySelector(".entry-name")?.insertAdjacentHTML("afterbegin", `<i class="fa-solid fa-thumbtack mrp-dir-icon" title="MR- Pizarra"></i> `);
  }
});

Hooks.on("getJournalEntryContextOptions", (app, options) => {
  const doc = (li) => game.journal.get((li instanceof HTMLElement ? li : li[0]).dataset.entryId);
  options.push({
    name: t("convert"),
    icon: '<i class="fa-solid fa-thumbtack"></i>',
    condition: (li) => game.user.isGM && !doc(li)?.getFlag(ID, "board"),
    callback: (li) => convertToBoard(doc(li)),
  });
});
