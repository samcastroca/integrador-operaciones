// facturaLogs.routes.mjs — historial de envíos (bitácora). Contrato en test/README.md.
import { Router } from "express";
import { listarLogs, obtenerLogPorId } from "./facturaLogs.sqlite.mjs";
import logger from "./logger.mjs";

const router = Router();

/** Un entero de la consulta acotado a [min, max]; `porDefecto` si no es un número. */
function entero(valor, porDefecto, min, max) {
    const n = parseInt(valor, 10);
    return Math.min(max, Math.max(min, Number.isNaN(n) ? porDefecto : n));
}

/**
 * GET /logs/facturas?operation_id=&success=0|1&page=&pageSize=
 * `count` es el total de filas que cumplen el filtro; `data`, solo la página pedida.
 */
router.get("/", (req, res) => {
    try {
        const { operation_id, success } = req.query;
        const page = entero(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
        const pageSize = entero(req.query.pageSize, 50, 1, 200);
        const { data, total } = listarLogs({
            operationId: typeof operation_id === "string" ? operation_id.trim() : undefined,
            success: success === "0" || success === "1" ? Number(success) : undefined,
            page,
            pageSize,
        });
        res.json({ ok: true, page, pageSize, count: total, data });
    } catch (err) {
        logger.error("Error listando el historial", { mensaje: err.message, stack: err.stack });
        res.status(500).json({ ok: false, mensaje: "No se pudo leer el historial." });
    }
});

/** GET /logs/facturas/:id — un registro con lo enviado y la respuesta de Faktur. */
router.get("/:id", (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id < 1) return res.status(400).json({ ok: false, mensaje: "Registro no válido." });
        const row = obtenerLogPorId(id);
        if (!row) return res.status(404).json({ ok: false, mensaje: "No se encontró ese registro." });
        res.json({ ok: true, data: row });
    } catch (err) {
        logger.error("Error leyendo un registro del historial", { mensaje: err.message, stack: err.stack });
        res.status(500).json({ ok: false, mensaje: "No se pudo leer el registro." });
    }
});

export default router;
