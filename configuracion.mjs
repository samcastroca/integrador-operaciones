// configuracion.mjs — configuración del integrador en SQLite (una sola fila).
import { createHash } from "node:crypto";
import { db } from "./datos.mjs";

export const OCULTO = "********";

db.exec(`
  CREATE TABLE IF NOT EXISTS configuracion (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    ip             TEXT NOT NULL,
    puerto         INTEGER NOT NULL,
    email          TEXT NOT NULL,
    contrasena_md5 TEXT NOT NULL,
    iapp           TEXT NOT NULL,
    nit            TEXT NOT NULL,
    faktur_url     TEXT NOT NULL,
    faktur_token   TEXT NOT NULL,
    actualizado    TEXT NOT NULL
  );
`);

const leerStmt = db.prepare(`SELECT * FROM configuracion WHERE id = 1`);
const guardarStmt = db.prepare(`
  INSERT INTO configuracion (id, ip, puerto, email, contrasena_md5, iapp, nit, faktur_url, faktur_token, actualizado)
  VALUES (1, @ip, @puerto, @email, @contrasenaMd5, @iapp, @nit, @fakturUrl, @fakturToken, @actualizado)
  ON CONFLICT(id) DO UPDATE SET
    ip = excluded.ip, puerto = excluded.puerto, email = excluded.email,
    contrasena_md5 = excluded.contrasena_md5, iapp = excluded.iapp, nit = excluded.nit,
    faktur_url = excluded.faktur_url, faktur_token = excluded.faktur_token, actualizado = excluded.actualizado
`);

/** @returns {{ip, puerto, email, contrasenaMd5, iapp, nit, fakturUrl, fakturToken} | null} */
export function leerConfig() {
    const f = leerStmt.get();
    if (!f) return null;
    return {
        ip: f.ip,
        puerto: f.puerto,
        email: f.email,
        contrasenaMd5: f.contrasena_md5,
        iapp: f.iapp,
        nit: f.nit,
        fakturUrl: f.faktur_url,
        fakturToken: f.faktur_token,
    };
}

export function guardarConfig(cfg) {
    guardarStmt.run({ ...cfg, actualizado: new Date().toISOString() });
}

/** Error con un mensaje apto para mostrar al usuario. */
export class ErrorConfig extends Error { }

const texto = (v) => (v === undefined || v === null ? "" : String(v).trim());

/**
 * Convierte el cuerpo del formulario (contrato de /api/config) en una configuración completa.
 * Una `contrasena` o un `fakturToken` vacíos (o el marcador oculto) conservan el valor guardado.
 */
export function completarConGuardada(cuerpo = {}) {
    const guardada = leerConfig();
    const contrasena = texto(cuerpo.contrasena);
    const token = texto(cuerpo.fakturToken);

    const cfg = {
        ip: texto(cuerpo.ip),
        puerto: Number(texto(cuerpo.puerto)),
        email: texto(cuerpo.email),
        contrasenaMd5: contrasena && contrasena !== OCULTO
            ? createHash("md5").update(contrasena).digest("hex")
            : guardada?.contrasenaMd5 ?? "",
        iapp: texto(cuerpo.iapp),
        nit: texto(cuerpo.nit),
        fakturUrl: texto(cuerpo.fakturUrl),
        fakturToken: token && token !== OCULTO ? token : guardada?.fakturToken ?? "",
    };

    const faltan = [
        ["ip", "la IP de ContaPyme"],
        ["email", "el email"],
        ["contrasenaMd5", "la contraseña"],
        ["iapp", "el iapp"],
        ["nit", "el NIT"],
        ["fakturUrl", "la URL de Faktur"],
        ["fakturToken", "el token de Faktur"],
    ].filter(([k]) => !cfg[k]).map(([, nombre]) => nombre);
    if (!Number.isInteger(cfg.puerto) || cfg.puerto < 1 || cfg.puerto > 65535) faltan.splice(1, 0, "un puerto válido");
    if (faltan.length) throw new ErrorConfig(`Falta ${faltan.join(", ")}.`);
    if (!/^https?:\/\/\S+$/.test(cfg.fakturUrl)) throw new ErrorConfig("La URL de Faktur debe empezar por http:// o https://.");
    return cfg;
}

/** Forma pública (contrato de GET /api/config), con contraseña y token ocultos. */
export function ocultar(cfg) {
    return {
        ip: cfg.ip,
        puerto: cfg.puerto,
        email: cfg.email,
        contrasena: OCULTO,
        iapp: cfg.iapp,
        nit: cfg.nit,
        fakturUrl: cfg.fakturUrl,
        fakturToken: OCULTO,
    };
}
