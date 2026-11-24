// Etapa 3 — Envío a demanda. Contrato en test/README.md.
import assert from "node:assert/strict";
import test from "node:test";
import { etapa } from "./ayudas/etapa.mjs";
import { abrirBase, enviarYEsperar, esperarEnvio, montarEscenario, TOKEN_FAKTUR } from "./ayudas/escenario.mjs";
import { esperar, pedir } from "./ayudas/servidor.mjs";
import { METODOS_LECTURA } from "./simuladores/contapyme.mjs";

const E = etapa(3);
const consultar = (url, body) => pedir(`${url}/api/facturas/consultar`, { method: "POST", body });
const DIA = { modo: "dia", fecha: "2026-11-20" };

test("3.1 el filtro rechaza entradas inválidas o con SQL (400)", E, async () => {
    const e = await montarEscenario();
    try {
        const invalidas = [
            { modo: "dia", fecha: "2026-11-20' OR '1'='1" },
            { modo: "dia", fecha: "20/11/2026" },
            { modo: "rango", desde: "2026-11-01", hasta: "2026-11-20; DROP TABLE x" },
            { modo: "rango", desde: "2026-11-20", hasta: "2026-11-01" },
            { modo: "numeros", numeros: ["FV-1001' OR 1=1 --"] },
            { modo: "numeros", numeros: [] },
            { modo: "sql", sql: "1=1" },
            {},
        ];
        for (const cuerpo of invalidas) {
            const r = await consultar(e.url, cuerpo);
            assert.equal(r.status, 400, `debió rechazar ${JSON.stringify(cuerpo)}`);
            assert.ok(r.body.mensaje);
        }
        const listas = e.cp.peticiones.filter((p) => p.metodo === "GetListaOperaciones");
        assert.equal(listas.length, 0, "una entrada inválida llegó a ContaPyme");
    } finally {
        await e.parar();
    }
});

test("3.1 el filtro acepta día, rango y números válidos", E, async () => {
    const e = await montarEscenario();
    try {
        for (const cuerpo of [DIA, { modo: "rango", desde: "2026-11-01", hasta: "2026-11-20" }, { modo: "numeros", numeros: ["FV-1001", "FV-1002"] }]) {
            const r = await consultar(e.url, cuerpo);
            assert.equal(r.status, 200, `${JSON.stringify(cuerpo)} → ${JSON.stringify(r.body)}`);
        }
    } finally {
        await e.parar();
    }
});

test("3.2 / 3.4 consultar recorre todas las páginas y devuelve la lista ligera", E, async () => {
    const e = await montarEscenario({ contapyme: { facturas: 120 } });
    try {
        const r = await consultar(e.url, DIA);
        assert.equal(r.status, 200);
        assert.equal(r.body.facturas.length, 120);
        for (const campo of ["inumoper", "snumsop", "fecha", "tercero", "total", "yaEnviada"]) {
            assert.ok(campo in r.body.facturas[0], `falta ${campo}`);
        }
        assert.equal(new Set(r.body.facturas.map((f) => f.inumoper)).size, 120);
        assert.equal(e.fk.recibidas.length, 0, "consultar no debe enviar nada a Faktur");
    } finally {
        await e.parar();
    }
});

test("3.3 una factura enviada aparece como yaEnviada en la siguiente consulta", E, async () => {
    const e = await montarEscenario({ contapyme: { facturas: 3 } });
    try {
        await enviarYEsperar(e.url, ["1001", "1002"]);
        const marcas = Object.fromEntries((await consultar(e.url, DIA)).body.facturas.map((f) => [f.inumoper, f.yaEnviada]));
        assert.deepEqual(marcas, { 1001: true, 1002: true, 1003: false });
    } finally {
        await e.parar();
    }
});

test("3.5 una factura con fecha inválida falla sola y las demás se envían", E, async () => {
    const e = await montarEscenario({ contapyme: { facturas: 3, fechasInvalidas: ["1002"] } });
    try {
        const fin = await enviarYEsperar(e.url, ["1001", "1002", "1003"]);
        const porId = Object.fromEntries(fin.resultados.map((r) => [r.snumsop, r]));
        assert.equal(porId["FV-1001"].ok, true);
        assert.equal(porId["FV-1003"].ok, true);
        assert.equal(porId["FV-1002"].ok, false);
        assert.ok(porId["FV-1002"].motivo);
        assert.deepEqual(e.fk.recibidas.map((r) => r.cuerpo.operation_id).sort(), ["FV-1001", "FV-1003"]);
        assert.ok(e.fk.recibidas.every((r) => r.authorization === `Token ${TOKEN_FAKTUR}`));
    } finally {
        await e.parar();
    }
});

test("3.6 POST /api/envios responde el id al instante", E, async () => {
    const e = await montarEscenario({ contapyme: { facturas: 3 }, faktur: { retrasoMs: 1500 } });
    try {
        const inicio = Date.now();
        const r = await pedir(`${e.url}/api/envios`, { method: "POST", body: { facturas: ["1001", "1002", "1003"] } });
        assert.ok(Date.now() - inicio < 500, `tardó ${Date.now() - inicio} ms`);
        assert.ok(r.body.id !== undefined);
        await esperarEnvio(e.url, r.body.id);
    } finally {
        await e.parar();
    }
});

test("3.7 el progreso avanza durante el envío", E, async () => {
    const e = await montarEscenario({ contapyme: { facturas: 6 }, faktur: { retrasoMs: 400 } });
    try {
        const facturas = e.cp.operaciones.map((o) => o.inumoper);
        const { body } = await pedir(`${e.url}/api/envios`, { method: "POST", body: { facturas } });
        const vistos = new Set();
        await esperar(async () => {
            const p = (await pedir(`${e.url}/api/envios/${body.id}`)).body;
            assert.equal(p.total, 6);
            vistos.add(p.procesadas);
            return p.procesadas === p.total;
        }, { cadaMs: 50, timeoutMs: 20000 });
        assert.ok(vistos.size >= 3, `solo se vieron estos valores de progreso: ${[...vistos]}`);
    } finally {
        await e.parar();
    }
});

test("3.8 bitácora: intento real y fecha en hora de Bogotá", E, async () => {
    const e = await montarEscenario({ contapyme: { facturas: 2 }, faktur: { modos: { "FV-1002": { fallas: 1, status: 503 } } } });
    try {
        await enviarYEsperar(e.url, ["1001", "1002"]);
        const db = abrirBase(e.srv.datosDir);
        const filas = db.prepare("SELECT operation_id, success, intento, created_at FROM factura_envios_log").all();
        db.close();
        const de = (id) => filas.find((f) => f.operation_id === id);
        assert.equal(de("FV-1001").intento, 1);
        assert.equal(de("FV-1002").intento, 2);
        for (const f of filas) assert.match(f.created_at, /-05:00$/, `created_at sin hora de Bogotá: ${f.created_at}`);
    } finally {
        await e.parar();
    }
});

test("3.8 un fallo al registrar en la bitácora no corta el envío", { todo: "definir cómo forzar el fallo desde fuera" }, () => {
    assert.fail("pendiente");
});

test("3.9 reintentar reenvía solo las fallidas y actualiza el resultado", E, async () => {
    const e = await montarEscenario({ contapyme: { facturas: 2 }, faktur: { modos: { "FV-1002": { fallas: 1 } } } });
    try {
        const primero = await enviarYEsperar(e.url, ["1001", "1002"]);
        assert.equal(primero.resultados.find((r) => r.snumsop === "FV-1002").ok, false);

        const r = await pedir(`${e.url}/api/envios/${primero.id}/reintentar`, { method: "POST" });
        assert.ok(r.status < 300, `status ${r.status}`);
        const id = r.body.id ?? primero.id;
        await esperar(async () => {
            const p = (await pedir(`${e.url}/api/envios/${id}`)).body;
            return p.resultados?.find((x) => x.snumsop === "FV-1002")?.ok === true;
        }, { timeoutMs: 20000 });
        assert.equal(e.fk.intentosDe("FV-1001"), 1, "FV-1001 ya había salido bien y se reenvió");
        assert.equal(e.fk.intentosDe("FV-1002"), 2);
    } finally {
        await e.parar();
    }
});

test("3.x ContaPyme solo recibe lecturas", E, async () => {
    const e = await montarEscenario({ contapyme: { facturas: 3 } });
    try {
        await consultar(e.url, DIA);
        await enviarYEsperar(e.url, ["1001", "1002", "1003"]);
        const otras = e.cp.peticiones.filter((p) => !METODOS_LECTURA.includes(p.clave));
        assert.deepEqual(otras.map((p) => p.clave), []);
    } finally {
        await e.parar();
    }
});
