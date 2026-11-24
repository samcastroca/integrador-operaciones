// Arranca el integrador real como proceso hijo, con su propia carpeta de datos temporal.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { entrada, raiz } from "./etapa.mjs";

export async function puertoLibre() {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1");
    await once(srv, "listening");
    const { port } = srv.address();
    srv.close();
    await once(srv, "close");
    return port;
}

export async function esperar(condicion, { timeoutMs = 10000, cadaMs = 100, detalle = () => "" } = {}) {
    const limite = Date.now() + timeoutMs;
    let ultimoError;
    while (Date.now() < limite) {
        try {
            const valor = await condicion();
            if (valor) return valor;
        } catch (err) {
            ultimoError = err;
        }
        await new Promise((r) => setTimeout(r, cadaMs));
    }
    throw new Error(`Tiempo agotado esperando la condición. ${ultimoError?.message ?? ""}\n${detalle()}`);
}

/**
 * Contrato con el integrador: lee PORT, DATOS_DIR (carpeta de la base SQLite) y LOGS_DIR.
 * @returns {Promise<{url: string, puerto: number, datosDir: string, salida: () => string, parar: () => Promise<void>}>}
 */
export async function arrancarServidor({ env = {} } = {}) {
    const datosDir = mkdtempSync(path.join(tmpdir(), "integrador-prueba-"));
    const puerto = await puertoLibre();
    const hijo = spawn(process.execPath, [entrada], {
        cwd: raiz,
        env: {
            ...process.env,
            PORT: String(puerto),
            DATOS_DIR: datosDir,
            LOGS_DIR: path.join(datosDir, "logs"),
            ...env,
        },
        stdio: ["ignore", "pipe", "pipe"],
    });
    let salida = "";
    hijo.stdout.on("data", (d) => (salida += d));
    hijo.stderr.on("data", (d) => (salida += d));
    const terminado = once(hijo, "exit");

    const url = `http://127.0.0.1:${puerto}`;
    const parar = async () => {
        if (hijo.exitCode === null) {
            hijo.kill();
            await terminado;
        }
        rmSync(datosDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    };

    try {
        await esperar(async () => hijo.exitCode === null && (await fetch(`${url}/health`)).ok, {
            detalle: () => `Salida del integrador:\n${salida}`,
        });
    } catch (err) {
        await parar();
        throw err;
    }
    return { url, puerto, datosDir, salida: () => salida, parar };
}

/** Petición JSON al integrador. Devuelve `{ status, body }` (body = texto si no es JSON). */
export async function pedir(url, { method = "GET", body } = {}) {
    const res = await fetch(url, {
        method,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const texto = await res.text();
    let datos = texto;
    try {
        datos = JSON.parse(texto);
    } catch { }
    return { status: res.status, body: datos, headers: res.headers };
}
