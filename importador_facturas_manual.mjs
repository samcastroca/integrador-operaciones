// index.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import logsRouter from "./logs.routes.mjs";
import facturaLogsRouter from "./facturaLogs.routes.mjs";
import configRouter from "./config.routes.mjs";
import { enviosRouter, facturasRouter } from "./envios.routes.mjs";

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

// Salud
app.get("/health", async (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });

});


// Nuevas rutas de logs de facturas en SQLite
app.use("/logs/facturas", facturaLogsRouter);

// Montar las rutas de logs protegidas
//app.use("/logs", logsRouter);




// Solo en 127.0.0.1: la app no es accesible desde otros equipos de la red.
const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Integrador escuchando en http://localhost:${PORT}`);
});
