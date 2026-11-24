// Faktur simulado: POST /api/operations/ con una respuesta forzable por operation_id.
import { once } from "node:events";
import http from "node:http";

/**
 * @param {object} opciones
 * @param {Record<string, "4xx"|"5xx"|"timeout"|{fallas: number, status?: number}>} [opciones.modos]
 *        respuesta por operation_id; `{fallas: n}` falla las n primeras veces (status 400 por defecto)
 *        y luego acepta. Sin modo → éxito (201).
 * @param {number} [opciones.retrasoMs] espera antes de responder cada operación
 */
export async function simularFaktur({ modos = {}, retrasoMs = 0 } = {}) {
    const recibidas = [];
    const intentos = new Map();

    const servidor = http.createServer(async (req, res) => {
        let cuerpo = "";
        for await (const trozo of req) cuerpo += trozo;
        const responder = (status, datos) => {
            res.writeHead(status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(datos));
        };

        if (req.method !== "POST" || !req.url.startsWith("/api/operations")) {
            return responder(200, { ok: true, servicio: "faktur-simulado" });
        }

        let datos = {};
        try {
            datos = JSON.parse(cuerpo);
        } catch { }
        const id = datos.operation_id;
        recibidas.push({ authorization: req.headers.authorization, cuerpo: datos });
        const n = (intentos.get(id) ?? 0) + 1;
        intentos.set(id, n);

        if (retrasoMs) await new Promise((r) => setTimeout(r, retrasoMs));

        const modo = modos[id];
        if (modo === "timeout") return; // nunca responde
        if (modo === "4xx") return responder(400, { detail: `Operación ${id} rechazada por el simulador` });
        if (modo === "5xx") return responder(503, { detail: "Servicio no disponible (simulado)" });
        if (typeof modo === "object" && n <= modo.fallas) {
            return responder(modo.status ?? 400, { detail: `Fallo simulado ${n} de ${modo.fallas}` });
        }
        responder(201, { id: recibidas.length, operation_id: id, estado: "creada" });
    });
    servidor.listen(0, "127.0.0.1");
    await once(servidor, "listening");
    const { port } = servidor.address();
    const url = `http://127.0.0.1:${port}`;

    return {
        url,
        urlOperaciones: `${url}/api/operations/`,
        puerto: port,
        recibidas,
        intentosDe: (id) => intentos.get(id) ?? 0,
        cerrar: async () => {
            servidor.closeAllConnections();
            servidor.close();
            await once(servidor, "close");
        },
    };
}
