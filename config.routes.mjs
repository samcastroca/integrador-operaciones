// config.routes.mjs — GET/PUT /api/config y POST /api/config/probar (contrato en test/README.md).
import express from "express";
import axios from "axios";
import { probarConexion } from "./api.mjs";
import { completarConGuardada, ErrorConfig, guardarConfig, leerConfig, ocultar } from "./configuracion.mjs";
import logger from "./logger.mjs";

const router = express.Router();

// Puerto del agente en el servidor de pruebas (subtarea 1.1); se confirma con el cliente (1.2).
const PUERTO_LOCAL = Number(process.env.CONTAPYME_PUERTO_LOCAL || 9000);

/** Busca un agente ContaPyme en este equipo. Devuelve `{ ip, puerto }` o `null`. */
async function detectarLocal() {
    const url = `http://127.0.0.1:${PUERTO_LOCAL}/datasnap/rest/TBasicoGeneral/"GetAuth"/`;
    try {
        const { data } = await axios.post(url, { _parameters: [{ email: "", password: "" }, "", "", "0"] }, { timeout: 1500 });
        return Array.isArray(data?.result) ? { ip: "127.0.0.1", puerto: PUERTO_LOCAL } : null;
    } catch {
        return null;
    }
}

/** Lee el cuerpo, completa con lo guardado y prueba la conexión. */
async function probar(cuerpo) {
    const cfg = completarConGuardada(cuerpo);
    return { cfg, ...(await probarConexion(cfg)) };
}

function responderError(res, err) {
    if (err instanceof ErrorConfig) return res.status(400).json({ ok: false, mensaje: err.message });
    logger.error("Error en /api/config", { mensaje: err.message, stack: err.stack });
    return res.status(500).json({ ok: false, mensaje: "Ocurrió un error inesperado al procesar la configuración." });
}

router.get("/", async (_req, res) => {
    try {
        const cfg = leerConfig();
        if (cfg) return res.json({ configurado: true, config: ocultar(cfg) });
        const sugerencia = await detectarLocal();
        res.json({ configurado: false, config: { ip: sugerencia?.ip ?? "", puerto: sugerencia?.puerto ?? "" }, detectado: !!sugerencia });
    } catch (err) {
        responderError(res, err);
    }
});

router.post("/probar", async (req, res) => {
    try {
        const { ok, mensaje } = await probar(req.body);
        res.json({ ok, mensaje });
    } catch (err) {
        responderError(res, err);
    }
});

router.put("/", async (req, res) => {
    try {
        const { cfg, ok, mensaje } = await probar(req.body);
        if (!ok) return res.status(400).json({ ok, mensaje });
        guardarConfig(cfg);
        logger.info("Configuración guardada", { ip: cfg.ip, puerto: cfg.puerto, fakturUrl: cfg.fakturUrl });
        res.json({ ok: true, mensaje: "Configuración guardada.", config: ocultar(cfg) });
    } catch (err) {
        responderError(res, err);
    }
});

export default router;
