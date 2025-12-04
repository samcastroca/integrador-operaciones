// logs.routes.mjs
import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { logsDir } from "./logger.mjs";

const router = Router();

// Acepta: app-YYYY-MM-DD.log o app-YYYY-MM-DD.log.gz
const validName = /^app-\d{4}-\d{2}-\d{2}\.log(\.gz)?$/i;

// Utilidad para formatear fecha local (respetará TZ=America/Bogota dentro del contenedor)
function todayFileBase() {
    const d = new Date(); // se asume TZ del sistema
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `app-${yyyy}-${mm}-${dd}.log`;
}

// Lista todos los logs disponibles
router.get("/", async (_req, res) => {
    try {
        const files = await fs.promises.readdir(logsDir);
        const filtered = files
            .filter((f) => validName.test(f))
            .sort()
            .reverse(); // más reciente primero por nombre

        res.json({
            directory: logsDir,
            count: filtered.length,
            files: filtered,
        });
    } catch (err) {
        res.status(500).json({ error: "Cannot read logs directory", details: String(err) });
    }
});

// Tail del log de HOY (solo .log plano; si está rotado y comprimido no se hace tail)
router.get("/today/tail/:lines?", async (req, res) => {
    try {
        const maxLines = 2000;
        const n = Math.min(
            Math.max(parseInt(req.params.lines ?? "200", 10) || 200, 1),
            maxLines
        );

        const fileName = todayFileBase();
        const filePath = path.join(logsDir, fileName);

        if (!fs.existsSync(filePath)) {
            // Si el de hoy no existe, puede que ya esté comprimido por rotación
            const gzToday = `${fileName}.gz`;
            if (fs.existsSync(path.join(logsDir, gzToday))) {
                return res.status(409).json({
                    error: "Today's log is compressed",
                    file: gzToday,
                    hint: "Download the .gz file and inspect locally.",
                });
            }
            return res.status(404).json({ error: "Today's log not found", file: fileName });
        }

        const content = await fs.promises.readFile(filePath, "utf8");
        const lines = content.split(/\r?\n/);
        const tail = lines.slice(-n).join("\n");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.send(tail);
    } catch (err) {
        res.status(500).json({ error: "Cannot tail today's log", details: String(err) });
    }
});

// Descargar / ver un log específico
router.get("/:file", async (req, res) => {
    try {
        const { file } = req.params;
        if (!validName.test(file)) {
            return res.status(400).json({ error: "Invalid file name" });
        }
        const resolved = path.join(logsDir, file);

        // Evita path traversal
        const normalized = path.normalize(resolved);
        if (!normalized.startsWith(path.normalize(logsDir + path.sep))) {
            return res.status(400).json({ error: "Invalid path" });
        }

        if (!fs.existsSync(normalized)) {
            return res.status(404).json({ error: "Log file not found", file });
        }

        const isGz = file.endsWith(".gz");
        res.setHeader("Content-Type", isGz ? "application/gzip" : "text/plain; charset=utf-8");
        res.sendFile(normalized);
    } catch (err) {
        res.status(500).json({ error: "Cannot serve log file", details: String(err) });
    }
});

export default router;
