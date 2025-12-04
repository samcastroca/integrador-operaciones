// index.mjs
import { autenticacion, obtenerUsuario, enviarFacturasProcesadas } from "./api.mjs";

const recurso1 = "/datasnap/rest/";

(async () => {
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

    //const sql = "OprMaest.fcreacion LIKE '%2025-05-08%'";
    //const sql = "OprMaest.fcreacion between '2025-05-08' and '2025-05-09'";
    //const sql = "OprMaest.inumoper = 111170 OR OprMaest.inumoper = 111187";
    const sql = false;

    await enviarFacturasProcesadas(nit, ip_del_servidor, puerto, recurso1, keyagente, iapp, plazo, tipos_de_facturas, sql);

    //console.log("Resultado final:", JSON.stringify(DatosProcesados));

  } catch (error) {
    console.error("Error ", error);
  }
})();



