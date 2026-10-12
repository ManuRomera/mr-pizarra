import test from "node:test";
import assert from "node:assert/strict";
import { parseImport, normalizeImport, buildPrompt, IMPORT_FORMAT } from "../scripts/import.mjs";
import { planOps, BACKGROUNDS, PAPERS, FRAMES, STAMPS, MARKS, PINS, PIN_LAYOUTS } from "../scripts/rules.mjs";

const ok = {
  format: IMPORT_FORMAT, version: 1, title: "Caso", background: "corcho-noir",
  items: [
    { ref: "caso", type: "clipping", x: 1300, y: 800, title: "Titular", text: "Texto", paper: "periodico-2", hidden: false },
    { ref: "viuda", type: "entity", kind: "Actor", name: "Eleanor", x: 900, y: 500, showToAll: true },
    { ref: "carta", type: "journal", title: "Carta", text: "Hola\n\nMundo", x: 1900, y: 500, hidden: true },
    { ref: "n", type: "note", text: "llave", color: "rosa", x: 100, y: 100 },
  ],
  links: [{ from: "viuda", to: "caso", color: "rojo", style: "solido", label: "esposa" }, { from: "carta", to: "viuda" }],
};

test("parseImport saca el JSON de vallas de código y de texto alrededor", () => {
  const body = JSON.stringify(ok);
  assert.equal(parseImport("```json\n" + body + "\n```").title, "Caso");
  assert.equal(parseImport("Aquí tienes:\n```\n" + body + "\n```\nSuerte").title, "Caso");
  assert.equal(parseImport("  " + body + "  ").title, "Caso");
  assert.throws(() => parseImport(""), /nada que importar/);
  assert.throws(() => parseImport("sin json"), /objeto JSON/);
  assert.throws(() => parseImport('{"a": }'), /no es válido/);
});

test("normalizeImport: piezas válidas, hilos y estadísticas", () => {
  const r = normalizeImport(ok);
  assert.equal(r.items.length, 4);
  assert.equal(r.links.length, 2);
  assert.equal(r.background, "corcho-noir");
  assert.deepEqual([r.stats.hidden, r.stats.pending, r.stats.documents], [1, 1, 1]);
  assert.equal(r.items[1].showToAll, true);
  assert.equal(r.items[2].journalText, "Hola\n\nMundo");
  assert.equal(r.links[1].color, "rojo");
});

test("normalizeImport: valores desconocidos se corrigen con aviso y lo roto se omite", () => {
  const r = normalizeImport({ items: [
    { ref: "a", type: "clipping", paper: "papel-inexistente", x: 5000, y: -5 },
    { ref: "b", type: "nave" },
    { ref: "c", type: "entity" },
    { ref: "a", type: "note", text: "dup" },
    { ref: "d", type: "stamp", kind: "x", pinColor: "rojo", pin: "grapa" },
  ], links: [{ from: "a", to: "zzz" }, { from: "a", to: "a" }] });
  assert.equal(r.items.length, 3);
  assert.equal(r.items[0].data.paper, "periodico-1");
  assert.equal(r.items[0].data.x, 3160);
  assert.equal(r.items[0].data.y, 0);
  assert.equal(r.items[1].ref, "a-4");
  assert.equal(r.items[2].data.kind, "marco-rect-rojo");
  assert.equal(r.items[2].data.pinColor, undefined);
  assert.equal(r.links.length, 0);
  const errors = r.issues.filter((i) => i.level === "error").map((i) => i.message).join("|");
  assert.match(errors, /desconocido/);
  assert.match(errors, /necesita «name»/);
  assert.match(errors, /Referencia desconocida/);
  assert.match(errors, /dos piezas distintas/);
});

test("normalizeImport: lo que no trae posición se coloca en una cuadrícula sin pisarse", () => {
  const r = normalizeImport({ items: Array.from({ length: 10 }, (_, i) => ({ ref: `p${i}`, type: "note", text: "x" })) });
  const pos = r.items.map((i) => `${i.data.x},${i.data.y}`);
  assert.equal(new Set(pos).size, 10);
  assert.ok(r.items.every((i) => i.data.x < 3200 && i.data.y < 2000));
});

test("normalizeImport: lo importado pasa planOps como lo pasaría la hoja", () => {
  const r = normalizeImport(ok);
  const GM = { isGM: true, userId: "gm0000000000" };
  const ops = r.items.filter((i) => i.type !== "journal").map((it, n) => ({ op: "set", kind: "items", id: `aaaaaaaa${String(n).padStart(8, "0")}`, data: { ...it.data, z: n + 1 } }));
  const plan = planOps({}, ops, GM);
  assert.equal(Object.keys(plan.board.items).length, 3);
  assert.equal(plan.board.items["aaaaaaaa00000001"].uuid, "");
});

test("capas, grupos y modo caja", () => {
  const r = normalizeImport({ mode: "box", layers: [{ ref: "a", name: "Inicio", revealed: true }, { ref: "b", name: "Giro" }, { ref: "a", name: "dup" }, { ref: "c" }],
    items: [{ ref: "n", type: "note", text: "x", layer: "a", group: "Pistas" }, { ref: "m", type: "note", text: "y", layer: "zzz" }], links: [{ from: "n", to: "m" }] });
  assert.equal(r.mode, "box");
  assert.deepEqual(r.layers.map((l) => [l.ref, l.revealed]), [["a", true], ["b", false]]);
  assert.equal(r.items[0].layerRef, "a");
  assert.equal(r.items[0].data.group, "Pistas");
  assert.equal(r.items[1].layerRef, undefined);
  assert.equal(r.items[0].data.x, undefined, "en modo caja no se colocan");
  assert.equal(r.links.length, 0);
  const text = r.issues.map((i) => i.message).join("|");
  assert.match(text, /no está definida/);
  assert.match(text, /En modo caja no hay hilos/);
  assert.match(text, /necesita «ref» y «name»/);
  assert.equal(normalizeImport({ items: [] }).mode, "board");
});

test("buildPrompt incluye el catálogo real y la estructura del JSON (los dos modos)", () => {
  for (const mode of ["board", "box"]) {
    const p = buildPrompt({ mode });
    for (const id of [...PAPERS, ...FRAMES, ...STAMPS, ...MARKS, ...PINS, ...BACKGROUNDS].map((e) => e.id)) assert.ok(p.includes(`"${id}"`), `${mode}: falta ${id}`);
    for (const k of Object.keys(PIN_LAYOUTS)) assert.ok(p.includes(`"${k}"`), `${mode}: falta ${k}`);
    for (const frag of [IMPORT_FORMAT, "layers", "revealed", "sin vincular"]) assert.ok(p.includes(frag), `${mode}: falta «${frag}»`);
    const example = /## \d+\. Ejemplo[\s\S]*?```json\n([\s\S]*?)```/.exec(p)[1];
    const r = normalizeImport(JSON.parse(example));
    assert.equal(r.issues.filter((i) => i.level === "error").length, 0, `${mode}: ${JSON.stringify(r.issues)}`);
    assert.equal(r.mode, mode);
    assert.equal(r.layers.length, 2);
    assert.ok(r.items.every((i) => i.layerRef), `${mode}: todas las piezas del ejemplo llevan capa`);
  }
  const board = buildPrompt();
  for (const frag of ["3200 × 2000", "\"links\"", "Caminos", "camino"]) assert.ok(board.includes(frag), `falta «${frag}»`);
  const box = buildPrompt({ mode: "box" });
  for (const frag of ["no hay posiciones ni hilos", "group", "por sí sola"]) assert.ok(box.includes(frag), `falta «${frag}»`);
  assert.ok(!box.includes("3200 × 2000"));
  assert.equal(normalizeImport(JSON.parse(/## \d+\. Ejemplo[\s\S]*?```json\n([\s\S]*?)```/.exec(board)[1])).items.length, 5);
});
