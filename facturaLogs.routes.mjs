// facturaLogs.routes.mjs
import { Router } from "express";
import { listarLogs, obtenerLogPorId } from "./facturaLogs.sqlite.mjs";

const router = Router();

/**
 * GET /logs/facturas
 * Query params:
 *   - operation_id (opcional)
 *   - success = 0|1 (opcional)
 *   - page, pageSize (opcionales)
 */
router.get("/", (req, res) => {
    try {
        const {
            operation_id,
            success,
            page = "1",
            pageSize = "50",
        } = req.query;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSizeNum = Math.min(200, parseInt(pageSize, 10) || 50);

        let successFilter;
        if (success === "0" || success === "1") {
            successFilter = Number(success);
        }

        const data = listarLogs({
            operationId: operation_id,
            success: successFilter,
            page: pageNum,
            pageSize: pageSizeNum,
        });

        res.json({
            ok: true,
            page: pageNum,
            pageSize: pageSizeNum,
            count: data.length,
            data,
        });
    } catch (err) {
        console.error("Error listando logs de facturas", err);
        res.status(500).json({ ok: false, error: "Error interno" });
    }
});

/**
 * GET /logs/facturas/:id
 * Devuelve un log puntual por ID.
 */
router.get("/:id", (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id) {
            return res.status(400).json({ ok: false, error: "ID inválido" });
        }

        const row = obtenerLogPorId(id);
        if (!row) {
            return res.status(404).json({ ok: false, error: "No encontrado" });
        }

        res.json({ ok: true, data: row });
    } catch (err) {
        console.error("Error obteniendo log de factura", err);
        res.status(500).json({ ok: false, error: "Error interno" });
    }
});

export default router;
