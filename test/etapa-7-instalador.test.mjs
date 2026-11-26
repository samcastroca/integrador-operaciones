// Etapa 7 — Instalador y arranque. La prueba en Windows limpio (7.7) es manual.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { etapa, raiz } from "./ayudas/etapa.mjs";
import { esperar, puertoLibre } from "./ayudas/servidor.mjs";

const E = etapa(7);
const existe = (f) => existsSync(path.join(raiz, f));

test("7.1 / 7.2 existen iniciar.bat e instalar.ps1", E, () => {
    assert.ok(existe("iniciar.bat"));
    assert.ok(existe("instalar.ps1"));
    const ps = readFileSync(path.join(raiz, "instalar.ps1"), "utf8");
    assert.match(ps, /npm ci/);
    assert.match(ps, /Integrador Faktur/);
});

test("7.1 dos arranques seguidos no levantan dos servidores", { ...E, skip: process.platform !== "win32" && "solo Windows" }, async () => {
    // Contrato: iniciar.bat respeta PORT y no abre el navegador si INTEGRADOR_SIN_NAVEGADOR=1.
    assert.ok(existe("iniciar.bat"), "falta iniciar.bat");
    const puerto = await puertoLibre();
    const env = { ...process.env, PORT: String(puerto), INTEGRADOR_SIN_NAVEGADOR: "1" };
    const lanzar = async () => {
        // Ruta absoluta: con NoDefaultCurrentDirectoryInExePath, cmd no busca en el directorio actual.
        const p = spawn("cmd.exe", ["/c", path.join(raiz, "iniciar.bat")], { cwd: raiz, env, stdio: "ignore", detached: true });
        p.unref();
    };
    let pids = [];
    try {
        await lanzar();
        await esperar(async () => (await fetch(`http://127.0.0.1:${puerto}/health`)).ok, { timeoutMs: 20000 });
        await lanzar();
        await new Promise((r) => setTimeout(r, 3000));
        const netstat = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
        pids = [...new Set(netstat.split(/\r?\n/).filter((l) => l.includes(`:${puerto} `) && /LISTEN/.test(l)).map((l) => l.trim().split(/\s+/).at(-1)))];
        assert.equal(pids.length, 1, `procesos escuchando en ${puerto}: ${pids}`);
    } finally {
        for (const pid of pids) execFileSync("taskkill", ["/PID", pid, "/T", "/F"], { stdio: "ignore" });
    }
});

test("7.5 servicio.ps1 instala WinSW comprobado por SHA-256 y se puede quitar", E, () => {
    // Instalarlo de verdad exige administrador (UAC): se comprueba a mano (etapas.md, 7.5).
    assert.ok(existe("servicio.ps1"), "falta servicio.ps1");
    const ps = readFileSync(path.join(raiz, "servicio.ps1"), "utf8");
    assert.match(ps, /winsw\/winsw\/releases\/download\/v[\d.]+\//);
    assert.match(ps, /Get-FileHash/);
    assert.match(ps, /\$shaWinSW = "[0-9A-F]{64}"/);
    assert.match(ps, /\[switch\]\$Quitar/);
});

test("7.3 better-sqlite3 está en el lockfile", E, () => {
    const lock = JSON.parse(readFileSync(path.join(raiz, "package-lock.json"), "utf8"));
    assert.ok(lock.packages["node_modules/better-sqlite3"]);
});

test("7.6 Docker retirado", E, () => {
    assert.ok(!existe("Dockerfile"));
    assert.ok(!existe("docker-compose.yaml"));
});

test("7.8 guía de uso para el cliente", E, () => {
    assert.ok(existe("GUIA.md") || existe("docs/guia.md"), "falta la guía (GUIA.md o docs/guia.md)");
});
