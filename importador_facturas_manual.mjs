// index.mjs
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { autenticacion, enviarFacturasProcesadas } from "./api.mjs";
import logsRouter from "./logs.routes.mjs";
import facturaLogsRouter from "./facturaLogs.routes.mjs";
import configRouter from "./config.routes.mjs";
import { leerConfig } from "./configuracion.mjs";

const app = express();
const raiz = path.dirname(fileURLToPath(import.meta.url));

// Middlewares básicos
app.use(express.json());            // Parseo de JSON en body
app.use(express.urlencoded({ extended: true })); // Por si usas x-www-form-urlencoded

// Interfaz: estáticos propios y Bootstrap servido localmente (sin CDN)
app.use(express.static(path.join(raiz, "public")));
app.use("/vendor/bootstrap", express.static(path.join(raiz, "node_modules", "bootstrap", "dist")));

app.use("/api/config", configRouter);

// Salud
app.get("/health", async (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });

});

async function runProceso({ accion, fecha, fechaInicio, fechaFin, idsFacturas }) {
  try {
    const cfg = leerConfig();
    if (!cfg) {
      console.error("El integrador no está configurado: abre la pantalla de configuración.");
      return;
    }
    const tipos_de_facturas = "ING1";

    const keyagente = await autenticacion(cfg);
    let sql = "";
    switch (accion) {
      case "fecha":
        sql = "OprMaest.fcreacion LIKE '%" + fecha + "%'";
        break;
      case "rango":
        sql = "OprMaest.fcreacion between '" + fechaInicio + "' and '" + fechaFin + "'";
        break;
      case "ids":
        const respuestaids = await procesarIds(idsFacturas);
        console.log(respuestaids);
        sql = "OprMaest.snumsop = " + respuestaids;
        break;
      default:
        sql = false;
        break;
    }

    console.log(sql);
    await enviarFacturasProcesadas(cfg, keyagente, tipos_de_facturas, sql);




  } catch (error) {
    console.error("Error ", error);
  }
}


app.post("/api/procesar", async (req, res) => {

  try {
    // 1) Lee y valida los dos parámetros
    const { accion = false, fecha = false, fechaInicio = false, fechaFin = false, idsFacturas = false } = req.body ?? {};

    if (!(typeof accion === "string" || accion === false)) {
      return res.status(400).json({ ok: false, error: "`sql` debe ser string o false" });
    }
    // 2) Ejecuta el flujo (tu IIFE convertido en función)
    runProceso({ accion, fecha, fechaInicio, fechaFin, idsFacturas });

    // 3) Respuesta OK
    return res.json({
      ok: true,
      resultado: "Ejecución comenzada",
      input: { accion, fecha, fechaInicio, fechaFin, idsFacturas },
    });

  } catch (error) {
    console.error("❌ Error en /api/procesar:", error);
    return res.status(500).json({
      ok: false,
      error: "Error interno del servidor",
      detalle: process.env.NODE_ENV === "development" ? String(error?.stack || error) : undefined,
    });
  }
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


async function procesarIds(idsFacturas) {
  let arregloTags = [];


  if (idsFacturas !== "") {
    if (idsFacturas.includes(",")) {
      arregloTags = idsFacturas.split(",");
      let consolidado = arregloTags
        .map(tag => `'${tag}'`) // aquí se agregan las comillas simples
        .join(" OR OprMaest.snumsop = ");

      return consolidado;

    }
    else {
      arregloTags = idsFacturas;
      return `'${arregloTags}'`;
    }
  }
}

