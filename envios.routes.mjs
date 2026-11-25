// envios.routes.mjs — POST /api/facturas/consultar y /api/envios (contrato en test/README.md).
import express from "express";
import { autenticacion, consultarFacturas } from "./api.mjs";
import { leerConfig } from "./configuracion.mjs";
import { crearEnvio, ErrorEnvio, estadoEnvio, obtenerEnvio, reintentarEnvio } from "./envios.mjs";
import { yaEnviadas } from "./facturaLogs.sqlite.mjs";
import { construirFiltro, ErrorFiltro } from "./filtro.mjs";
import logger from "./logger.mjs";

export const facturasRouter = express.Router();
export const enviosRouter = express.Router();

const MAX_FACTURAS = 1000;

/** La configuración guardada, o un error 409 si el integrador aún no está configurado. */
function exigirConfig() {
    const cfg = leerConfig();
    if (!cfg) throw new ErrorEnvio("El integrador no está configurado: abre la pantalla de configuración.", 409);
    return cfg;
}

function responderError(res, err, cfg) {
    if (err instanceof ErrorFiltro) return res.status(400).json({ ok: false, mensaje: err.message });
    if (err instanceof ErrorEnvio) return res.status(err.status).json({ ok: false, mensaje: err.message });
    if (err.agente) return res.status(502).json({ ok: false, mensaje: `ContaPyme respondió: ${err.message}` });
    if (err.isAxiosError) {
        return res.status(502).json({
            ok: false,
            mensaje: `No se pudo conectar con ContaPyme en ${cfg?.ip}:${cfg?.puerto}. Revisa que el agente esté encendido.`,
        });
    }
    logger.error("Error inesperado", { mensaje: err.message, stack: err.stack });
    return res.status(500).json({ ok: false, mensaje: "Ocurrió un error inesperado. Revisa los logs del integrador." });
}

facturasRouter.post("/consultar", async (req, res) => {
    let cfg;
    try {
        const sql = construirFiltro(req.body);
        cfg = exigirConfig();
        const keyagente = await autenticacion(cfg);
        const facturas = await consultarFacturas(cfg, keyagente, sql);
        const enviadas = yaEnviadas(facturas.map((f) => f.snumsop));
        res.json({ facturas: facturas.map((f) => ({ ...f, yaEnviada: enviadas.has(f.snumsop) })) });
    } catch (err) {
        responderError(res, err, cfg);
    }
});

enviosRouter.post("/", (req, res) => {
    try {
        const lista = req.body?.facturas;
        if (!Array.isArray(lista) || lista.length === 0) throw new ErrorEnvio("Elige al menos una factura.");
        if (lista.length > MAX_FACTURAS) throw new ErrorEnvio(`Se pueden enviar hasta ${MAX_FACTURAS} facturas a la vez.`);
        const inumopers = [...new Set(lista.map((n) => String(n).trim()))];
        if (inumopers.some((n) => !/^\d{1,15}$/.test(n))) throw new ErrorEnvio("La lista de facturas no es válida.");
        const envio = crearEnvio(exigirConfig(), inumopers);
        res.status(202).json({ id: envio.id });
    } catch (err) {
        responderError(res, err);
    }
});

enviosRouter.get("/:id", (req, res) => {
    const envio = obtenerEnvio(req.params.id);
    if (!envio) return res.status(404).json({ ok: false, mensaje: "No se encontró ese envío." });
    res.json(estadoEnvio(envio));
});

enviosRouter.post("/:id/reintentar", (req, res) => {
    try {
        const envio = reintentarEnvio(exigirConfig(), req.params.id);
        res.status(202).json({ id: envio.id });
    } catch (err) {
        responderError(res, err);
    }
});
