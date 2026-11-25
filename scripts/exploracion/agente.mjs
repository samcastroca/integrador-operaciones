// Helper de la etapa 1: llamadas de SOLO LECTURA al agente ContaPyme y guardado de las respuestas en
// bruto en capturas/ (ignorada por git: contiene datos reales sin anonimizar).
// Se ejecuta con `node --env-file=.env scripts/exploracion/<script>.mjs`.
import axios from "axios";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

export const md5 = (texto) => createHash("md5").update(texto).digest("hex");

const requerida = (nombre) => {
    const valor = process.env[nombre];
    if (!valor) throw new Error(`Falta ${nombre} en .env (ver scripts/exploracion/README.md)`);
    return valor;
};

export const cfg = {
    ip: requerida("CP_IP"),
    puerto: requerida("CP_PUERTO"),
    email: requerida("CP_EMAIL"),
    contrasena: requerida("CP_CONTRASENA"),
    iapp: requerida("CP_IAPP"),
    controlkey: process.env.CP_CONTROLKEY || "1D740FDE63",
};

export const capturas = new URL("../../capturas/", import.meta.url);

export function guardar(nombre, datos) {
    mkdirSync(capturas, { recursive: true });
    writeFileSync(new URL(`${nombre}.json`, capturas), JSON.stringify(datos, null, 2));
}

/** POST a `http://ip:puerto/datasnap/rest/<recurso>` con `_parameters`. Devuelve el JSON tal cual. */
export async function llamar(recurso, parametros) {
    const url = `http://${cfg.ip}:${cfg.puerto}/datasnap/rest/${recurso}`;
    const { data } = await axios.post(url, { _parameters: parametros }, { timeout: 20000 });
    return data;
}

export const encabezado = (r) => r?.result?.[0]?.encabezado ?? {};
export const datos = (r) => r?.result?.[0]?.respuesta?.datos;

/** Variantes del cuerpo de GetAuth que se prueban en 1.4, en orden de preferencia. */
export const VARIANTES_LOGIN = {
    "string-md5": () => [JSON.stringify({ email: cfg.email, password: md5(cfg.contrasena) }), cfg.controlkey, cfg.iapp, "0"],
    "objeto-md5": () => [{ email: cfg.email, password: md5(cfg.contrasena) }, cfg.controlkey, cfg.iapp, "0"],
    // Las dos siguientes se rechazan; se mantienen como prueba de lo descartado en 1.4.
    "objeto-md5-mayus": () => [{ email: cfg.email, password: md5(cfg.contrasena).toUpperCase() }, cfg.controlkey, cfg.iapp, "0"],
    "objeto-claro-userId": () => [{ email: cfg.email, password: cfg.contrasena, userId: cfg.iapp }, cfg.controlkey, cfg.iapp, "0"],
};

/** Login con una variante; devuelve el keyagente o lanza con el `mensaje` del agente. */
export async function login(variante = process.env.CP_LOGIN_VARIANTE || "string-md5") {
    const r = await llamar('TBasicoGeneral/"GetAuth"/', VARIANTES_LOGIN[variante]());
    const key = datos(r)?.keyagente;
    if (encabezado(r).resultado !== "true" || !key) {
        throw new Error(`Login (${variante}) rechazado: ${encabezado(r).mensaje || JSON.stringify(r)}`);
    }
    return key;
}
