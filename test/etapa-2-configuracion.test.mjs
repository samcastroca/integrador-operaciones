// Etapa 2 — Configuración sin WordPress. Contrato en test/README.md.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import path from "node:path";
import test from "node:test";
import { etapa, raiz } from "./ayudas/etapa.mjs";
import { abrirBase, configPara, montarEscenario, TOKEN_FAKTUR } from "./ayudas/escenario.mjs";
import { arrancarServidor, pedir, puertoLibre } from "./ayudas/servidor.mjs";
import { md5, simularContaPyme } from "./simuladores/contapyme.mjs";

const E = etapa(2);
const OCULTO = "********";

/** Código fuente versionado del integrador (sin pruebas ni fixtures). */
function codigoFuente() {
    return execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: raiz, encoding: "utf8" })
        .split("\0")
        .filter((f) => /\.(mjs|js|cjs|html)$/.test(f) && !/^(test|fixtures|node_modules)\//.test(f))
        .map((f) => ({ f, texto: readFileSync(path.join(raiz, f), "utf8") }));
}

test("2.1 una sola base SQLite en DATOS_DIR con configuracion y factura_envios_log", E, async () => {
    const e = await montarEscenario();
    try {
        const db = abrirBase(e.srv.datosDir);
        const tablas = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
        db.close();
        assert.ok(tablas.includes("configuracion"), `tablas: ${tablas}`);
        assert.ok(tablas.includes("factura_envios_log"), `tablas: ${tablas}`);
    } finally {
        await e.parar();
    }
});

test("2.2 / 2.6 PUT guarda y GET devuelve lo guardado con contraseña y token ocultos", E, async () => {
    const e = await montarEscenario();
    try {
        const r = await pedir(`${e.url}/api/config`);
        assert.equal(r.status, 200);
        assert.equal(r.body.configurado, true);
        const c = r.body.config;
        assert.equal(c.ip, e.cp.ip);
        assert.equal(Number(c.puerto), e.cp.puerto);
        assert.equal(c.email, e.cp.email);
        assert.equal(c.iapp, "1001");
        assert.equal(c.fakturUrl, e.fk.urlOperaciones);
        assert.equal(c.contrasena, OCULTO);
        assert.equal(c.fakturToken, OCULTO);
        assert.ok(!JSON.stringify(r.body).includes(e.cp.contrasena));
        assert.ok(!JSON.stringify(r.body).includes(TOKEN_FAKTUR));
    } finally {
        await e.parar();
    }
});

test("2.6 un PUT con credenciales malas se rechaza y no altera lo guardado", E, async () => {
    const e = await montarEscenario();
    try {
        const r = await pedir(`${e.url}/api/config`, {
            method: "PUT",
            body: configPara(e.cp, e.fk, { contrasena: "incorrecta", iapp: "9999" }),
        });
        assert.ok(r.status >= 400 && r.status < 500, `status ${r.status}`);
        assert.equal(r.body.ok, false);
        assert.ok(r.body.mensaje);
        const g = await pedir(`${e.url}/api/config`);
        assert.equal(g.body.config.iapp, "1001");
    } finally {
        await e.parar();
    }
});

test("2.6 una contraseña vacía conserva la guardada", E, async () => {
    const e = await montarEscenario();
    try {
        const r = await pedir(`${e.url}/api/config`, {
            method: "PUT",
            body: configPara(e.cp, e.fk, { contrasena: "", fakturToken: "", iapp: "2002" }),
        });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.equal((await pedir(`${e.url}/api/config`)).body.config.iapp, "2002");
    } finally {
        await e.parar();
    }
});

test("2.3 el login envía la contraseña en MD5 (hex en minúsculas)", E, async () => {
    const e = await montarEscenario();
    try {
        const logins = e.cp.peticiones.filter((p) => p.metodo === "GetAuth");
        assert.ok(logins.length > 0, "el integrador no hizo login");
        const cred = logins.at(-1).params[0];
        const { password } = typeof cred === "string" ? JSON.parse(cred) : cred;
        assert.equal(password, md5(e.cp.contrasena));
    } finally {
        await e.parar();
    }
});

test("2.4 / 2.11 sin WordPress ni tokens en el código", E, () => {
    const prohibidos = [/wp-json/, /obtenerUsuario/, /WP_APP_PASSWORD/, /FAKTUR_TOKEN/, /develop\.faktur\.co/];
    const hallazgos = [];
    for (const { f, texto } of codigoFuente()) for (const re of prohibidos) if (re.test(texto)) hallazgos.push(`${f}: ${re}`);
    assert.deepEqual(hallazgos, []);
    assert.ok(!codigoFuente().some(({ f }) => f === "importador_facturas_plazo.mjs"));
    const pkg = JSON.parse(readFileSync(path.join(raiz, "package.json"), "utf8"));
    assert.ok(!pkg.scripts.start?.includes("importador_facturas_plazo"), "el script start sigue usando el modo por plazo");
});

test("2.5 probar conexión: éxito, mensaje del agente y error de red, sin guardar", E, async () => {
    const e = await montarEscenario({ configurar: false });
    try {
        const probar = (cambios) => pedir(`${e.url}/api/config/probar`, { method: "POST", body: configPara(e.cp, e.fk, cambios) });

        const ok = await probar({});
        assert.equal(ok.status, 200);
        assert.equal(ok.body.ok, true);

        const malo = await probar({ contrasena: "incorrecta" });
        assert.equal(malo.body.ok, false);
        assert.match(malo.body.mensaje, /Usuario o contraseña inválidos/);

        const sinRed = await probar({ puerto: await puertoLibre() });
        assert.equal(sinRed.body.ok, false);
        assert.ok(sinRed.body.mensaje);

        assert.equal((await pedir(`${e.url}/api/config`)).body.configurado, false);
    } finally {
        await e.parar();
    }
});

test("2.7 detección de ContaPyme en localhost", { todo: "el contrato depende del puerto real del agente (1.1)" }, () => {
    assert.fail("pendiente");
});

test("2.8 sirve la interfaz en 127.0.0.1 y no es accesible desde la IP de la red", E, async (t) => {
    const srv = await arrancarServidor();
    try {
        const r = await fetch(`${srv.url}/`);
        assert.equal(r.status, 200);
        assert.match(r.headers.get("content-type"), /text\/html/);
        assert.equal(srv.puerto > 0, true);

        const ipLan = Object.values(networkInterfaces()).flat().find((i) => i.family === "IPv4" && !i.internal)?.address;
        if (!ipLan) return t.skip("el equipo no tiene IP de red local");
        await assert.rejects(fetch(`http://${ipLan}:${srv.puerto}/health`, { signal: AbortSignal.timeout(3000) }));
    } finally {
        await srv.parar();
    }
});

test("2.9 con la base vacía la app no está configurada", E, async () => {
    const srv = await arrancarServidor();
    try {
        const r = await pedir(`${srv.url}/api/config`);
        assert.equal(r.status, 200);
        assert.equal(r.body.configurado, false);
    } finally {
        await srv.parar();
    }
});

test("2.10 cambiar el puerto se refleja en la siguiente consulta (requiere 3.4)", etapa(3), async () => {
    const e = await montarEscenario();
    const otro = await simularContaPyme();
    try {
        const r = await pedir(`${e.url}/api/config`, {
            method: "PUT",
            body: configPara(e.cp, e.fk, { puerto: otro.puerto, contrasena: "" }),
        });
        assert.equal(r.status, 200, JSON.stringify(r.body));
        const antes = e.cp.peticiones.length;
        await pedir(`${e.url}/api/facturas/consultar`, { method: "POST", body: { modo: "dia", fecha: "2026-11-20" } });
        assert.ok(otro.peticiones.some((p) => p.metodo === "GetListaOperaciones"));
        assert.equal(e.cp.peticiones.filter((p, i) => i >= antes && p.metodo === "GetListaOperaciones").length, 0);
    } finally {
        await otro.cerrar();
        await e.parar();
    }
});
