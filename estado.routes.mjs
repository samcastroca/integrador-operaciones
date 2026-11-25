// estado.routes.mjs — estado de la conexión (subtarea 4.6). Contrato en test/README.md.
import express from "express";
import { probarConexion, probarFaktur } from "./api.mjs";
import { leerConfig } from "./configuracion.mjs";

const router = express.Router();

const SIN_CONFIG = { ok: false, mensaje: "El integrador no está configurado: abre la pantalla de configuración." };

/** Destinos de ContaPyme y de Faktur según la configuración guardada. */
router.get("/", (_req, res) => {
    const cfg = leerConfig();
    if (!cfg) return res.json({ configurado: false, contapyme: null, faktur: null });
    res.json({ configurado: true, contapyme: `${cfg.ip}:${cfg.puerto}`, faktur: cfg.fakturUrl });
});

router.post("/probar/contapyme", async (_req, res) => {
    const cfg = leerConfig();
    if (!cfg) return res.status(409).json(SIN_CONFIG);
    res.json(await probarConexion(cfg));
});

router.post("/probar/faktur", async (_req, res) => {
    const cfg = leerConfig();
    if (!cfg) return res.status(409).json(SIN_CONFIG);
    res.json(await probarFaktur(cfg));
});

export default router;
