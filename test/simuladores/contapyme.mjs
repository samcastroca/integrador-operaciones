// Agente REST DataSnap de ContaPyme simulado, alimentado con fixtures/contapyme/.
// Formato del login confirmado en la subtarea 1.4 contra el agente real (24-nov-2026): primer
// parámetro como objeto o string JSON y contraseña en MD5 hex en MINÚSCULAS (no mayúsculas).
import { createHash } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import http from "node:http";

const fixture = (nombre) =>
    JSON.parse(readFileSync(new URL(`../../fixtures/contapyme/${nombre}.json`, import.meta.url), "utf8"));

export const md5 = (texto) => createHash("md5").update(texto).digest("hex");

export const METODOS_LECTURA = ["GetAuth", "GetListaOperaciones", "DoExecuteOprAction:LOAD", "GetInfoTercero"];

const respuesta = (datos, extra = {}) => ({
    result: [{ encabezado: { resultado: "true", mensaje: "" }, respuesta: { datos, ...extra } }],
});
const fallo = (mensaje) => ({ result: [{ encabezado: { resultado: "false", mensaje }, respuesta: {} }] });

/**
 * @param {object} opciones
 * @param {string} [opciones.email]
 * @param {string} [opciones.contrasena] contraseña en claro; el agente espera su MD5 en minúsculas
 * @param {number} [opciones.facturas] cuántas facturas devuelve la lista (inumoper 1001, 1002…)
 * @param {string[]} [opciones.fechasInvalidas] inumoper cuyo detalle trae una fecha inválida
 * @param {boolean} [opciones.compradorJuridico] el comprador de cada factura es persona jurídica
 * @param {string} [opciones.napellido] sustituye el `napellido` del tercero natural (p. ej. con espacios de más)
 */
export async function simularContaPyme({
    email = "pruebas@empresa.test",
    contrasena = "clave-de-pruebas",
    facturas = 3,
    fechasInvalidas = [],
    compradorJuridico = false,
    napellido,
} = {}) {
    const lista = fixture("lista-operaciones");
    const detalle = fixture("detalle-factura");
    const natural = fixture("tercero-natural");
    const juridica = fixture("tercero-juridica");
    const keyagente = "KEY-AGENTE-SIMULADO";
    const peticiones = [];

    const baseLista = lista.result[0].respuesta.datos[0];
    const operaciones = Array.from({ length: facturas }, (_, i) => {
        const inumoper = String(1001 + i);
        return { ...baseLista, inumoper, snumsop: `FV-${inumoper}` };
    });

    function atender(metodo, params) {
        const [p0] = params;
        switch (metodo) {
            case "GetAuth": {
                const cred = typeof p0 === "string" ? JSON.parse(p0) : p0;
                if (cred?.email === email && cred?.password === md5(contrasena)) {
                    return respuesta({ keyagente });
                }
                return fallo("Usuario o contraseña inválidos");
            }
            case "GetListaOperaciones": {
                if (params[1] !== keyagente) return fallo("Sesión no válida");
                const tam = Number(p0?.datospagina?.cantidadregistros ?? 50);
                const pagina = Number(p0?.datospagina?.pagina ?? 1);
                const totalpaginas = Math.max(1, Math.ceil(operaciones.length / tam));
                return respuesta(operaciones.slice((pagina - 1) * tam, pagina * tam), {
                    paginacion: {
                        pagina: String(pagina),
                        totalpaginas: String(operaciones.length ? totalpaginas : 0),
                        totalregistros: String(operaciones.length),
                    },
                });
            }
            case "DoExecuteOprAction": {
                if (params[1] !== keyagente) return fallo("Sesión no válida");
                if (p0?.accion !== "LOAD") return fallo("Acción no permitida en el simulador");
                const { inumoper } = p0.operaciones?.[0] ?? {};
                const datos = structuredClone(detalle.result[0].respuesta.datos);
                datos.encabezado.inumoper = String(inumoper);
                datos.encabezado.snumsop = `FV-${inumoper}`;
                if (fechasInvalidas.includes(String(inumoper))) datos.encabezado.fsoport = "fecha-invalida";
                datos.datosprincipales.init = compradorJuridico ? "900123456" : "1010101010";
                return respuesta(datos);
            }
            case "GetInfoTercero": {
                if (params[1] !== keyagente) return fallo("Sesión no válida");
                const base = String(p0?.init ?? "").startsWith("9") ? juridica : natural;
                const datos = structuredClone(base.result[0].respuesta.datos);
                datos.infobasica.init = String(p0?.init ?? "");
                if (napellido !== undefined && base === natural) datos.infobasica.napellido = napellido;
                return respuesta(datos);
            }
            default:
                return null;
        }
    }

    const servidor = http.createServer(async (req, res) => {
        let cuerpo = "";
        for await (const trozo of req) cuerpo += trozo;
        const ruta = decodeURIComponent(req.url);
        const metodo = ruta.match(/datasnap\/rest\/\w+\/"?(\w+)"?/)?.[1];
        let params = [];
        try {
            params = JSON.parse(cuerpo || "{}")._parameters ?? [];
        } catch { }
        const accion = metodo === "DoExecuteOprAction" ? `:${params[0]?.accion}` : "";
        peticiones.push({ metodo, clave: `${metodo}${accion}`, ruta, verbo: req.method, params });

        const resultado = req.method === "POST" && metodo ? atender(metodo, params) : null;
        res.writeHead(resultado ? 200 : 404, { "Content-Type": "application/json" });
        res.end(JSON.stringify(resultado ?? { error: "ruta desconocida" }));
    });
    servidor.listen(0, "127.0.0.1");
    await once(servidor, "listening");
    const { port } = servidor.address();

    return {
        ip: "127.0.0.1",
        puerto: port,
        email,
        contrasena,
        keyagente,
        operaciones,
        peticiones,
        cerrar: async () => {
            servidor.closeAllConnections();
            servidor.close();
            await once(servidor, "close");
        },
    };
}
