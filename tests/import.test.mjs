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

test("buildPrompt incluye el catálogo real y la estructura del JSON", () => {
  const p = buildPrompt();
  for (const id of [...PAPERS, ...FRAMES, ...STAMPS, ...MARKS, ...PINS, ...BACKGROUNDS].map((e) => e.id)) assert.ok(p.includes(`"${id}"`), `falta ${id}`);
  for (const k of Object.keys(PIN_LAYOUTS)) assert.ok(p.includes(`"${k}"`), `falta ${k}`);
  for (const frag of [IMPORT_FORMAT, "hidden", "showToAll", "3200 × 2000", "\"links\"", "sin vincular"]) assert.ok(p.includes(frag), `falta «${frag}»`);
  // el ejemplo del prompt es una importación válida
  const example = /## 7[\s\S]*?```json\n([\s\S]*?)```/.exec(p)[1];
  const r = normalizeImport(JSON.parse(example));
  assert.equal(r.issues.filter((i) => i.level === "error").length, 0, JSON.stringify(r.issues));
  assert.equal(r.items.length, 5);
});
