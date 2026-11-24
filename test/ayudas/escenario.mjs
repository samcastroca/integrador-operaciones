// Escenario completo: ContaPyme simulado + Faktur simulado + integrador configurado contra ellos.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { simularContaPyme } from "../simuladores/contapyme.mjs";
import { simularFaktur } from "../simuladores/faktur.mjs";
import { arrancarServidor, esperar, pedir } from "./servidor.mjs";

export const TOKEN_FAKTUR = "token-de-pruebas";
export const NIT_EMISOR = "900999999";

/** Cuerpo de configuración (contrato de /api/config). */
export function configPara(cp, fk, cambios = {}) {
    return {
        ip: cp.ip,
        puerto: cp.puerto,
        email: cp.email,
        contrasena: cp.contrasena,
        iapp: "1001",
        nit: NIT_EMISOR,
        fakturUrl: fk.urlOperaciones,
        fakturToken: TOKEN_FAKTUR,
        ...cambios,
    };
}

export async function montarEscenario({ contapyme = {}, faktur = {}, configurar = true } = {}) {
    const cp = await simularContaPyme(contapyme);
    const fk = await simularFaktur(faktur);
    const srv = await arrancarServidor();
    const parar = async () => {
        await srv.parar();
        await cp.cerrar().catch(() => { });
        await fk.cerrar().catch(() => { });
    };
    if (configurar) {
        const r = await pedir(`${srv.url}/api/config`, { method: "PUT", body: configPara(cp, fk) });
        if (r.status !== 200) {
            await parar();
            assert.fail(`PUT /api/config respondió ${r.status}: ${JSON.stringify(r.body)}`);
        }
    }
    return { cp, fk, srv, url: srv.url, parar };
}

/** Lanza un envío y espera a que termine. Devuelve el estado final de GET /api/envios/:id. */
export async function enviarYEsperar(url, facturas, { timeoutMs = 20000 } = {}) {
    const r = await pedir(`${url}/api/envios`, { method: "POST", body: { facturas } });
    assert.ok(r.status >= 200 && r.status < 300, `POST /api/envios respondió ${r.status}`);
    assert.ok(r.body?.id !== undefined, "POST /api/envios debe devolver un id");
    return esperarEnvio(url, r.body.id, { timeoutMs });
}

export async function esperarEnvio(url, id, { timeoutMs = 20000 } = {}) {
    return esperar(
        async () => {
            const e = await pedir(`${url}/api/envios/${id}`);
            return e.status === 200 && e.body.total > 0 && e.body.procesadas === e.body.total ? { id, ...e.body } : null;
        },
        { timeoutMs },
    );
}

/** Abre la única base SQLite de la carpeta de datos (contrato de la subtarea 2.1). */
export function abrirBase(datosDir) {
    const archivos = readdirSync(datosDir).filter((f) => f.endsWith(".sqlite"));
    assert.equal(archivos.length, 1, `Se esperaba un único .sqlite en DATOS_DIR, hay: ${archivos.join(", ")}`);
    return new Database(path.join(datosDir, archivos[0]), { readonly: true });
}
