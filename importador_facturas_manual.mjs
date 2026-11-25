// index.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import logsRouter from "./logs.routes.mjs";
import facturaLogsRouter from "./facturaLogs.routes.mjs";
import configRouter from "./config.routes.mjs";
import { enviosRouter, facturasRouter } from "./envios.routes.mjs";
import estadoRouter from "./estado.routes.mjs";
import logger from "./logger.mjs";

const app = express();
const raiz = path.dirname(fileURLToPath(import.meta.url));

// Middlewares básicos
app.use(express.json());            // Parseo de JSON en body
app.use(express.urlencoded({ extended: true })); // Por si usas x-www-form-urlencoded

// Interfaz: estáticos propios y Bootstrap servido localmente (sin CDN)
app.use(express.static(path.join(raiz, "public")));
app.use("/vendor/bootstrap", express.static(path.join(raiz, "node_modules", "bootstrap", "dist")));

app.use("/api/config", configRouter);
app.use("/api/facturas", facturasRouter);
app.use("/api/envios", enviosRouter);
app.use("/api/estado", estadoRouter);

// Salud
app.get("/health", async (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });

});


// Nuevas rutas de logs de facturas en SQLite
app.use("/logs/facturas", facturaLogsRouter);

// Montar las rutas de logs protegidas
//app.use("/logs", logsRouter);

// Errores siempre como { ok: false, mensaje } en lenguaje del usuario (subtarea 4.7).
app.use(["/api", "/logs"], (_req, res) => {
  res.status(404).json({ ok: false, mensaje: "Esa acción no existe en el integrador." });
});
app.use((err, _req, res, _next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ ok: false, mensaje: "Los datos enviados no son válidos." });
  }
  logger.error("Error inesperado", { mensaje: err.message, stack: err.stack });
  res.status(err.status && err.status < 500 ? err.status : 500).json({
    ok: false,
    mensaje: "Ocurrió un error inesperado. Revisa los logs del integrador.",
  });
});




// Solo en 127.0.0.1: la app no es accesible desde otros equipos de la red.
const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Integrador escuchando en http://localhost:${PORT}`);
});
