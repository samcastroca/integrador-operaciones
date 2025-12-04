// index.mjs
import express from "express";
import { autenticacion, obtenerUsuario, enviarFacturasProcesadas } from "./api.mjs";
import logsRouter from "./logs.routes.mjs";

const app = express();

const recurso1 = "/datasnap/rest/";

// Middlewares básicos
app.use(express.json());            // Parseo de JSON en body
app.use(express.urlencoded({ extended: true })); // Por si usas x-www-form-urlencoded

// Salud
app.get("/health", async (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });

});

async function runProceso({ accion, fecha, fechaInicio, fechaFin, idsFacturas }) {
  try {
    const usuario = await obtenerUsuario(2);
    const nit = usuario.acf.nit;
    const ip_del_servidor = usuario.acf.ip_del_servidor;
    const puerto = usuario.acf.puerto;
    const email = usuario.acf.email;
    const contrasena = usuario.acf.contrasena;
    const iapp = usuario.acf.iapp;
    const plazo = usuario.acf.plazo;
    const tipos_de_facturas = "ING1";

    const Resultadoautenticacion = await autenticacion(ip_del_servidor, puerto, recurso1, email, contrasena, iapp);
    const keyagente = Resultadoautenticacion.result[0].respuesta.datos.keyagente;
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
    await enviarFacturasProcesadas(nit, ip_del_servidor, puerto, recurso1, keyagente, iapp, plazo, tipos_de_facturas, sql);




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


// Montar las rutas de logs protegidas
app.use("/logs", logsRouter);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API escuchando en http://localhost:${PORT}`);
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

