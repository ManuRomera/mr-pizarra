import test from "node:test";
import assert from "node:assert/strict";
import { planOps, look, rng, TABLES, BACKGROUNDS, PAPERS, MASKS, PINS, FLAG, AUTO_MASKS } from "../scripts/rules.mjs";
import { readFileSync, existsSync } from "node:fs";

const GM = { isGM: true, userId: "gm0000000000" };
const PL = { isGM: false, userId: "pl0000000000" };
const op = (id, data, kind = "items") => ({ op: "set", kind, id, data });
const ID1 = "aaaaaaaaaaaaaaaa";
const ID2 = "bbbbbbbbbbbbbbbb";

test("crea una nota con valores por defecto y rutas por pieza", () => {
  const plan = planOps({}, [op(ID1, { type: "note", x: 10.4, y: 20 })], PL);
  assert.equal(plan.update[`${FLAG}.items.${ID1}.color`], "amarillo");
  assert.equal(plan.update[`${FLAG}.items.${ID1}.x`], 10);
});

test("dos jugadoras mueven piezas distintas sin escribir en la misma ruta", () => {
  const board = { items: { [ID1]: { type: "note", x: 0, y: 0, z: 1 }, [ID2]: { type: "note", x: 0, y: 0, z: 1 } } };
  const a = planOps(board, [op(ID1, { x: 100 })], PL).update;
  const b = planOps(board, [op(ID2, { x: 300 })], PL).update;
  assert.equal(Object.keys(a).filter((k) => k in b).length, 0);
});

test("rechaza lo que no debe: tipo, campo ajeno, texto de sello en nota, id malo, imagen con ..", () => {
  assert.throws(() => planOps({}, [op(ID1, { type: "nave" })], GM), /Tipo/);
  assert.throws(() => planOps({}, [op(ID1, { type: "note", kind: "x" })], GM), /no permitido/);
  assert.throws(() => planOps({}, [op("../x", { type: "note" })], GM), /Identificador/);
  assert.throws(() => planOps({}, [op(ID1, { type: "photo", src: "a/../b.png" })], GM), /Imagen/);
  assert.throws(() => planOps({}, [op(ID1, { type: "photo" })], GM), /necesita/);
});

test("la proporción solo se cambia en recortes y documentos, y con límites", () => {
  const board = { items: { [ID1]: { type: "photo", x: 0, y: 0, z: 1, src: "a.png" }, [ID2]: { type: "clipping", x: 0, y: 0, z: 1 } } };
  assert.throws(() => planOps(board, [op(ID1, { ratio: 0.5 })], PL), /no permitido/);
  assert.equal(planOps(board, [op(ID2, { w: 400, ratio: 0.35 })], PL).board.items[ID2].ratio, 0.35);
  assert.equal(planOps(board, [op(ID2, { ratio: 99 })], PL).board.items[ID2].ratio, 2.2);
});

test("pizarra bloqueada: solo la Guardiana toca algo", () => {
  const locked = planOps({}, [op(ID1, { locked: true }, "settings")], GM).board;
  assert.equal(locked.locked, true);
  assert.throws(() => planOps(locked, [op(ID1, { type: "note" })], PL), /bloqueado/);
  assert.equal(planOps(locked, [op(ID1, { type: "note" })], GM).ops.length, 1);
  assert.throws(() => planOps({}, [op(ID1, { locked: true }, "settings")], PL), /bloquear/);
});

test("ocultas y privadas: solo la Guardiana oculta; una privada no la toca otra persona", () => {
  assert.throws(() => planOps({}, [op(ID1, { type: "note", hidden: true })], PL), /ocultar/);
  const hidden = planOps({}, [op(ID1, { type: "note", hidden: true })], GM).board;
  assert.throws(() => planOps(hidden, [op(ID1, { x: 5 })], PL), /No puedes/);
  const priv = planOps({}, [op(ID1, { type: "note", owner: PL.userId })], PL).board;
  assert.equal(planOps(priv, [op(ID1, { x: 5 })], PL).board.items[ID1].x, 5);
  assert.throws(() => planOps(priv, [op(ID1, { x: 5 })], { isGM: false, userId: "otro00000000" }), /No puedes/);
  assert.throws(() => planOps({}, [op(ID1, { type: "note", owner: "otro00000000" })], PL), /privada/);
});

test("journal y entidad: el uuid debe ser del tipo correcto", () => {
  const entry = "JournalEntry.abcdefghijklmnop";
  const page = `${entry}.JournalEntryPage.qrstuvwxyz123456`;
  const actor = "Actor.abcdefghijklmnop";
  assert.equal(planOps({}, [op(ID1, { type: "journal", uuid: page })], PL).board.items[ID1].uuid, page);
  assert.throws(() => planOps({}, [op(ID1, { type: "journal", uuid: actor })], PL), /colgar/);
  assert.throws(() => planOps({}, [op(ID1, { type: "entity", uuid: entry })], PL), /colgar/);
  assert.throws(() => planOps({}, [op(ID1, { type: "entity", uuid: `Compendium.world.pnj.${actor}` })], PL), /colgar/);
  assert.equal(planOps({}, [op(ID1, { type: "entity", uuid: "Scene.abcdefghijklmnop" })], PL).ops.length, 1);
  assert.throws(() => planOps({}, [op(ID1, { type: "journal", uuid: "JournalEntry.x" })], PL), /colgar/);
});

test("hilos: se editan, no se duplican y caen con su pieza", () => {
  let board = planOps({}, [op(ID1, { type: "note" }), op(ID2, { type: "note", x: 50 })], PL).board;
  const L = "cccccccccccccccc";
  let plan = planOps(board, [op(L, { from: ID1, to: ID2, color: "azul", style: "punteado" }, "links")], PL);
  assert.equal(plan.board.links[L].style, "punteado");
  board = plan.board;
  assert.equal(planOps(board, [op("dddddddddddddddd", { from: ID2, to: ID1, color: "azul", style: "punteado" }, "links")], PL).ops.length, 0);
  assert.equal(planOps(board, [op(L, { label: "coartada" }, "links")], PL).board.links[L].label, "coartada");
  assert.throws(() => planOps(board, [op(L, { color: "fucsia" }, "links")], PL), /Color/);
  const drop = planOps(board, [{ op: "remove", kind: "items", id: ID1 }], PL);
  assert.equal(drop.update[`${FLAG}.links.-=${L}`], null);
  assert.throws(() => planOps(board, [op("eeeeeeeeeeeeeeee", { from: ID1, to: ID1 }, "links")], PL), /distintas/);
});

test("fondo: solo los del catálogo", () => {
  assert.equal(planOps({}, [op(ID1, { background: "corcho-noir" }, "settings")], PL).update[`${FLAG}.background`], "corcho-noir");
  assert.throws(() => planOps({}, [op(ID1, { background: "../../x" }, "settings")], PL), /Fondo/);
});

test("lotes: límite de operaciones", () => {
  assert.throws(() => planOps({}, Array.from({ length: 61 }, () => op(ID1, { type: "note" })), GM), /Lote/);
});

test("apariencia: determinista por id y distinta entre piezas", () => {
  const item = { type: "clipping" };
  assert.deepEqual(look(ID1, item), look(ID1, item));
  const masks = new Set(Array.from({ length: 40 }, (_, i) => look(`pieza${i}xxxxxxxxxxx`, item).mask));
  assert.ok(masks.size >= 5, `solo ${masks.size} máscaras distintas`);
  assert.ok([...masks].every((m) => AUTO_MASKS.includes(m)));
  assert.equal(look("zzzzzzzzzzzzzzzz", { type: "photo" }).pins.length, 2, "las fotos llevan dos sujeciones en las esquinas");
  assert.equal(look(ID1, { type: "clipping" }).pins.length, 1);
  assert.equal(look(ID1, { type: "clipping" }).pins[0].x, 0.5);
  assert.equal(look(ID1, { type: "clipping", mask: "none", pin: "none", rot: 3 }).rot, 3);
  assert.equal(look(ID1, { type: "photo" }).mask, "none");
  assert.equal(look(ID1, { type: "clipping", pin: "none" }).pins.length, 0);
  const r = rng("x");
  assert.notEqual(r(), r());
});

test("sujeción: la pizarra la fija y cada pieza puede cambiarla", () => {
  const preset = { pin: "cinta-washi-rojo", color: "#2c6fbb", layout: "fourCorners" };
  const l = look(ID1, { type: "note" }, preset);
  assert.equal(l.pins.length, 4);
  assert.ok(l.pins.every((p) => p.pin === "cinta-washi-rojo"));
  assert.equal(l.color, "#2c6fbb");
  const own = look(ID1, { type: "note", pin: "grapa", pinLayout: "top", pinColor: "orig" }, preset);
  assert.deepEqual([own.pins.length, own.pins[0].pin, own.color], [1, "grapa", ""]);
  assert.equal(planOps({}, [op(ID1, { pinPreset: preset }, "settings")], PL).board.pinPreset.layout, "fourCorners");
  assert.throws(() => planOps({}, [op(ID1, { pinPreset: { ...preset, color: "rojo" } }, "settings")], PL), /Color/);
  assert.throws(() => planOps({}, [op(ID1, { pinPreset: { ...preset, layout: "x" } }, "settings")], PL), /Colocación/);
  assert.throws(() => planOps({}, [op(ID1, { type: "note", pinLayout: "x" })], PL), /Colocación/);
});

test("fotos: se pueden crear sin imagen y rellenarla después", () => {
  assert.equal(planOps({}, [op(ID1, { type: "photo", src: "" })], PL).board.items[ID1].src, "");
  assert.throws(() => planOps({}, [op(ID1, { type: "photo", src: "no-imagen" })], PL), /Imagen/);
});

test("catálogo: ids únicos y cada imagen existe en assets (si ya se generaron)", () => {
  for (const table of [BACKGROUNDS, PAPERS, MASKS, PINS]) assert.equal(new Set(table.map((e) => e.id)).size, table.length);
  const manifest = new URL("../assets/manifest.json", import.meta.url);
  if (!existsSync(manifest)) return;
  const m = JSON.parse(readFileSync(manifest, "utf8"));
  for (const t of Object.values(TABLES)) for (const e of t.values()) assert.ok(m[`${e.folder}/${e.id}`], `falta ${e.folder}/${e.id}`);
  for (const id of AUTO_MASKS) assert.ok(m[`bordes/${id}`].safe, `falta la zona segura de ${id}`);
  for (const b of BACKGROUNDS) assert.ok(b.size > 0, `falta el tamaño de ${b.id}`);
});
