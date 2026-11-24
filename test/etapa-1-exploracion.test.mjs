// Etapa 1 — Exploración. Lo automatizable: que estén las capturas reales (anonimizadas) que alimentan
// los simuladores. El login con curl (1.3–1.4) y las preguntas al cliente (1.2) se anotan en etapas.md.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { etapa, raiz } from "./ayudas/etapa.mjs";

const E = etapa(1);
const cp = (f) => path.join(raiz, "fixtures", "contapyme", f);
const leer = (f) => JSON.parse(readFileSync(f, "utf8"));
const datos = (f) => leer(cp(f)).result?.[0]?.respuesta?.datos;

test("1.5–1.8 los fixtures de ContaPyme son capturas reales (sin marcador PROVISIONAL)", E, () => {
    assert.ok(!existsSync(cp("PROVISIONAL")), "fixtures/contapyme/PROVISIONAL sigue existiendo: son sintéticos");
});

test("1.5 lista-operaciones.json trae operaciones y paginación", E, () => {
    const r = leer(cp("lista-operaciones.json")).result[0].respuesta;
    assert.ok(Array.isArray(r.datos) && r.datos.length > 0);
    assert.ok(r.paginacion?.totalpaginas !== undefined);
    for (const campo of ["inumoper", "itdoper", "snumsop", "fsoport", "mtotaloperacion"]) {
        assert.ok(campo in r.datos[0], `falta ${campo}`);
    }
});

test("1.6 detalle-factura.json trae encabezado, productos y formacobro", E, () => {
    const d = datos("detalle-factura.json");
    assert.ok(d.encabezado?.snumsop && d.encabezado?.fsoport && d.encabezado?.fcreacion);
    assert.ok(d.datosprincipales?.init);
    assert.ok(Array.isArray(d.listaproductos) && d.listaproductos.length > 0);
    assert.ok(d.formacobro, "falta formacobro");
});

test("1.7 terceros natural y jurídico con infobasica", E, () => {
    const n = datos("tercero-natural.json").infobasica;
    const j = datos("tercero-juridica.json").infobasica;
    assert.notEqual(n.bempresa, "T");
    assert.equal(j.bempresa, "T");
    for (const t of [n, j]) for (const c of ["init", "itddocum", "ntercero", "idep", "imun", "ipais"]) assert.ok(c in t, `falta ${c}`);
});

test("1.9 respuestas reales de Faktur de pruebas guardadas (éxito y error)", E, () => {
    for (const f of ["respuesta-exito.json", "respuesta-error.json"]) {
        const ruta = path.join(raiz, "fixtures", "faktur", f);
        assert.ok(existsSync(ruta), `falta fixtures/faktur/${f}`);
        leer(ruta);
    }
});
