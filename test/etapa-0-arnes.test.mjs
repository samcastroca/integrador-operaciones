// Etapa 0 — Arnés: simuladores, puerta por etapa y guardas del repositorio. Siempre obligatoria.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { etapa, etapaActual, raiz } from "./ayudas/etapa.mjs";
import { arrancarServidor, pedir } from "./ayudas/servidor.mjs";
import { md5Mayus, simularContaPyme } from "./simuladores/contapyme.mjs";
import { simularFaktur } from "./simuladores/faktur.mjs";

const RUTA = (cp, metodo) => `http://${cp.ip}:${cp.puerto}/datasnap/rest/TBasicoGeneral/%22${metodo}%22/`;

test("0.1 la puerta marca como TODO solo las etapas posteriores a config.etapa", () => {
    assert.deepEqual(etapa(etapaActual), {});
    assert.ok(etapa(etapaActual + 1).todo);
});

test("0.2 ContaPyme simulado: login con MD5 en mayúsculas, rechazo y paginación", async () => {
    const cp = await simularContaPyme({ facturas: 120 });
    try {
        const login = (password) =>
            pedir(RUTA(cp, "GetAuth"), {
                method: "POST",
                body: { _parameters: [JSON.stringify({ email: cp.email, password }), "CK", "1001", "0"] },
            });
        const ok = await login(md5Mayus(cp.contrasena));
        assert.equal(ok.body.result[0].respuesta.datos.keyagente, cp.keyagente);
        const malo = await login(cp.contrasena);
        assert.equal(malo.body.result[0].encabezado.resultado, "false");

        const pagina3 = await pedir(RUTA(cp, "GetListaOperaciones").replace("TBasicoGeneral", "TCatOperaciones"), {
            method: "POST",
            body: { _parameters: [{ datospagina: { cantidadregistros: "50", pagina: 3 } }, cp.keyagente, "1001", "0"] },
        });
        const r = pagina3.body.result[0].respuesta;
        assert.equal(r.paginacion.totalpaginas, "3");
        assert.equal(r.datos.length, 20);
    } finally {
        await cp.cerrar();
    }
});

test("0.3 Faktur simulado: éxito, 4xx y fallos que luego pasan", async () => {
    const fk = await simularFaktur({ modos: { B: "4xx", C: { fallas: 1 } } });
    try {
        const enviar = (operation_id) => pedir(fk.urlOperaciones, { method: "POST", body: { operation_id } });
        assert.equal((await enviar("A")).status, 201);
        assert.equal((await enviar("B")).status, 400);
        assert.equal((await enviar("C")).status, 400);
        assert.equal((await enviar("C")).status, 201);
        assert.equal(fk.intentosDe("C"), 2);
    } finally {
        await fk.cerrar();
    }
});

test("0.4 el integrador arranca con PORT y DATOS_DIR y responde /health", async () => {
    const srv = await arrancarServidor();
    try {
        const r = await pedir(`${srv.url}/health`);
        assert.equal(r.status, 200);
        assert.equal(r.body.ok, true);
    } finally {
        await srv.parar();
    }
});

test("0.5 ningún archivo versionado contiene credenciales", () => {
    const archivos = execFileSync("git", ["ls-files", "-z"], { cwd: raiz, encoding: "utf8" })
        .split("\0")
        .filter((f) => f && !f.endsWith("package-lock.json"));
    const patrones = [
        [/\b[0-9a-f]{40}\b/, "token hexadecimal de 40 caracteres (formato del token de Faktur)"],
        [/\b[A-Za-z0-9]{4}(?: [A-Za-z0-9]{4}){5}\b/, "contraseña de aplicación de WordPress"],
        [new RegExp(["Pruebas", "2525"].join("")), "contraseña de pruebas conocida"],
    ];
    const hallazgos = [];
    for (const f of archivos) {
        let texto;
        try {
            texto = readFileSync(path.join(raiz, f), "utf8");
        } catch {
            continue;
        }
        for (const [re, nombre] of patrones) if (re.test(texto)) hallazgos.push(`${f}: ${nombre}`);
    }
    assert.deepEqual(hallazgos, []);
});

test("0.6 package-lock.json incluye better-sqlite3 (npm ci coherente)", () => {
    const lock = JSON.parse(readFileSync(path.join(raiz, "package-lock.json"), "utf8"));
    assert.ok(lock.packages?.["node_modules/better-sqlite3"], "falta better-sqlite3 en el lockfile");
});
