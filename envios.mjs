// envios.mjs — envíos a demanda: se crean al instante y se procesan en segundo plano (subtareas 3.5–3.9).
// El estado de cada envío vive en memoria mientras el integrador está abierto; el resultado de cada
// factura queda además en la bitácora (factura_envios_log).
import { randomUUID } from "node:crypto";
import { armarPayload, autenticacion, cargarFactura, enviarAFaktur } from "./api.mjs";
import { guardarLogFactura } from "./facturaLogs.sqlite.mjs";
import logger from "./logger.mjs";

/** Facturas que se procesan a la vez (ContaPyme y Faktur). */
const CONCURRENCIA = 4;

const envios = new Map();

/** Error con un mensaje apto para mostrar al usuario y su código HTTP. */
export class ErrorEnvio extends Error {
    constructor(mensaje, status = 400) {
        super(mensaje);
        this.status = status;
    }
}

/** Crea un envío de las facturas (`inumoper`) y lo procesa en segundo plano. */
export function crearEnvio(cfg, inumopers) {
    const envio = { id: randomUUID(), inumopers, total: inumopers.length, procesadas: 0, resultados: [], terminado: false };
    envios.set(envio.id, envio);
    procesar(envio, cfg)
        .catch((err) => logger.error("Error inesperado en un envío", { id: envio.id, mensaje: err.message, stack: err.stack }))
        .finally(() => (envio.terminado = true));
    return envio;
}

export function obtenerEnvio(id) {
    return envios.get(id) ?? null;
}

/** Forma pública (contrato de GET /api/envios/:id). */
export function estadoEnvio(envio) {
    const { id, total, procesadas, terminado, resultados } = envio;
    return { id, total, procesadas, terminado, resultados };
}

/** Nuevo envío con solo las facturas que fallaron en `id`. */
export function reintentarEnvio(cfg, id) {
    const envio = obtenerEnvio(id);
    if (!envio) throw new ErrorEnvio("No se encontró ese envío. Vuelve a consultar las facturas.", 404);
    if (!envio.terminado) throw new ErrorEnvio("El envío todavía está en curso.", 409);
    const fallidas = envio.resultados.filter((r) => !r.ok).map((r) => r.inumoper);
    if (!fallidas.length) throw new ErrorEnvio("Ese envío no tiene facturas fallidas.");
    return crearEnvio(cfg, fallidas);
}

async function procesar(envio, cfg) {
    let keyagente;
    try {
        keyagente = await autenticacion(cfg);
    } catch (err) {
        const motivo = err.agente
            ? `ContaPyme rechazó la conexión: ${err.message}`
            : `No se pudo conectar con ContaPyme en ${cfg.ip}:${cfg.puerto}.`;
        for (const inumoper of envio.inumopers) {
            envio.resultados.push({ inumoper, snumsop: null, ok: false, motivo });
            envio.procesadas++;
        }
        return;
    }

    const cola = [...envio.inumopers];
    const trabajador = async () => {
        while (cola.length) {
            const inumoper = cola.shift();
            envio.resultados.push(await procesarFactura(cfg, keyagente, inumoper));
            envio.procesadas++;
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, cola.length) }, trabajador));
}

/** Lee, transforma y envía una factura. Nunca lanza: un fallo queda en el resultado de esa factura. */
async function procesarFactura(cfg, keyagente, inumoper) {
    let snumsop = null;
    let payload;
    try {
        const datos = await cargarFactura(cfg, keyagente, inumoper);
        snumsop = String(datos?.encabezado?.snumsop ?? "").trim() || null;
        payload = await armarPayload(cfg, keyagente, datos);
    } catch (err) {
        const motivo = motivoPreparacion(err, cfg);
        logger.warn("No se pudo preparar una factura", { inumoper, snumsop, mensaje: err.message, stack: err.stack });
        if (snumsop) registrar({ operationId: snumsop, success: false, intento: 0, errorMessage: motivo });
        return { inumoper, snumsop, ok: false, motivo };
    }

    const r = await enviarAFaktur(payload, cfg);
    registrar({
        operationId: payload.operation_id,
        success: r.ok,
        httpStatus: r.httpStatus,
        intento: r.intentos,
        requestBody: payload,
        responseBody: r.respuesta,
        errorMessage: r.motivo,
    });
    return { inumoper, snumsop: payload.operation_id, ok: r.ok, motivo: r.motivo };
}

function motivoPreparacion(err, cfg) {
    if (err.agente) return `ContaPyme respondió: ${err.message}`;
    if (err.isAxiosError) return `No se pudo leer la factura de ContaPyme en ${cfg.ip}:${cfg.puerto}.`;
    if (err instanceof TypeError) return "Faltan datos de la factura o del tercero en ContaPyme.";
    return `No se pudo preparar la factura: ${err.message}`;
}

/** Un fallo al escribir en la bitácora no corta el envío (subtarea 3.8). */
function registrar(fila) {
    try {
        guardarLogFactura(fila);
    } catch (err) {
        logger.error("No se pudo registrar el envío en la bitácora", { operationId: fila.operationId, mensaje: err.message });
    }
}
