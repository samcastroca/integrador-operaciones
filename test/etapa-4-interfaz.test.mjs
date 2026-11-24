// Etapa 4 — Interfaz completa. Lo visual (4.3, 4.4, 4.8) se revisa en el navegador con DevTools.
import assert from "node:assert/strict";
import test from "node:test";
import { etapa } from "./ayudas/etapa.mjs";
import { configPara, enviarYEsperar, montarEscenario } from "./ayudas/escenario.mjs";
import { arrancarServidor, pedir, puertoLibre } from "./ayudas/servidor.mjs";

const E = etapa(4);
const JERGA = /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up|status code \d+|\bat \S+ \(|TypeError|AxiosError/i;

test("4.1 la interfaz no pide nada a internet y Bootstrap se sirve en local", E, async () => {
    const srv = await arrancarServidor();
    try {
        const html = await (await fetch(`${srv.url}/`)).text();
        const refs = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"'#]+)["']/g)].map((m) => m[1]);
        const externas = refs.filter((r) => /^(https?:)?\/\//i.test(r));
        assert.deepEqual(externas, []);
        assert.ok(refs.some((r) => /bootstrap.*\.css/i.test(r)), "no se enlaza el CSS de Bootstrap");
        assert.ok(refs.some((r) => /bootstrap.*\.js/i.test(r)), "no se enlaza el JS de Bootstrap");
        for (const r of refs.filter((r) => !r.startsWith("mailto:"))) {
            const res = await fetch(new URL(r, `${srv.url}/`));
            assert.equal(res.status, 200, `recurso local no disponible: ${r}`);
        }
    } finally {
        await srv.parar();
    }
});

test("4.2 el menú lleva a las cuatro pantallas", E, async () => {
    const srv = await arrancarServidor();
    try {
        const html = await (await fetch(`${srv.url}/`)).text();
        for (const p of ["Enviar facturas", "Historial", "Estado de la conexión", "Configuración"]) {
            assert.ok(html.includes(p), `falta "${p}" en el menú`);
        }
        for (const campo of [/plazo/i, /moneda/i]) assert.doesNotMatch(html, campo, "campo no pedido en la maqueta");
    } finally {
        await srv.parar();
    }
});

test("4.5 historial: pageSize acotado y filtro por factura con todos sus intentos", E, async () => {
    const e = await montarEscenario({ contapyme: { facturas: 2 }, faktur: { modos: { "FV-1002": { fallas: 1 } } } });
    try {
        const neg = await pedir(`${e.url}/logs/facturas?pageSize=-1`);
        assert.equal(neg.status, 200);
        assert.ok(neg.body.pageSize >= 1 && neg.body.pageSize <= 200, `pageSize = ${neg.body.pageSize}`);

        const envio = await enviarYEsperar(e.url, ["1001", "1002"]);
        await pedir(`${e.url}/api/envios/${envio.id}/reintentar`, { method: "POST" });
        await new Promise((r) => setTimeout(r, 1000));

        const h = await pedir(`${e.url}/logs/facturas?operation_id=FV-1002`);
        assert.equal(h.body.count, 2, "deben verse los dos intentos de FV-1002");
        const detalle = await pedir(`${e.url}/logs/facturas/${h.body.data[0].id}`);
        assert.ok(detalle.body.data.request_body, "falta lo enviado");
        assert.ok(detalle.body.data.response_body, "falta la respuesta de Faktur");
    } finally {
        await e.parar();
    }
});

test("4.6 estado: con ContaPyme apagado su prueba falla y la de Faktur no", E, async () => {
    const e = await montarEscenario();
    try {
        const estado = await pedir(`${e.url}/api/estado`);
        assert.equal(estado.status, 200);
        assert.ok(JSON.stringify(estado.body).includes(String(e.cp.puerto)), "no muestra el destino de ContaPyme");
        assert.ok(JSON.stringify(estado.body).includes(e.fk.urlOperaciones), "no muestra el destino de Faktur");

        await e.cp.cerrar();
        const cp = await pedir(`${e.url}/api/estado/probar/contapyme`, { method: "POST" });
        const fk = await pedir(`${e.url}/api/estado/probar/faktur`, { method: "POST" });
        assert.equal(cp.body.ok, false);
        assert.equal(fk.body.ok, true);
    } finally {
        await e.parar();
    }
});

test("4.7 los errores llegan en lenguaje del usuario", E, async () => {
    const e = await montarEscenario({ contapyme: { facturas: 1 }, faktur: { modos: { "FV-1001": "4xx" } } });
    try {
        const mensajes = {};
        const probar = (c) => pedir(`${e.url}/api/config/probar`, { method: "POST", body: configPara(e.cp, e.fk, c) });

        mensajes.contapymeCaido = (await probar({ puerto: await puertoLibre() })).body.mensaje;
        mensajes.credenciales = (await probar({ contrasena: "incorrecta" })).body.mensaje;
        const rechazo = await enviarYEsperar(e.url, ["1001"]);
        mensajes.faktur4xx = rechazo.resultados[0].motivo;

        await pedir(`${e.url}/api/config`, {
            method: "PUT",
            body: configPara(e.cp, e.fk, { contrasena: "", fakturToken: "", fakturUrl: `http://127.0.0.1:${await puertoLibre()}/api/operations/` }),
        });
        const caido = await enviarYEsperar(e.url, ["1001"], { timeoutMs: 60000 });
        mensajes.fakturCaido = caido.resultados[0].motivo;

        for (const [caso, m] of Object.entries(mensajes)) {
            assert.ok(typeof m === "string" && m.length > 0, `${caso}: sin mensaje`);
            assert.doesNotMatch(m, JERGA, `${caso}: "${m}"`);
        }
    } finally {
        await e.parar();
    }
});
