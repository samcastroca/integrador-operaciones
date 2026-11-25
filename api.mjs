// autenticacion.mjs
import axios from "axios";
import moment from 'moment-timezone';
import logger from "./logger.mjs";
import { guardarLogFactura } from "./facturaLogs.sqlite.mjs";

/**
 * Función auxiliar para enviar POST
 */
export async function enviarPost(url, data, headers = {}, timeoutMs = 15000) {
    try {
        const response = await axios.post(url, data, { headers, timeout: timeoutMs });
        return response.data;
    } catch (error) {
        console.error("Error en la petición:", error.message);
        throw error;
    }
}

const RECURSO = "/datasnap/rest/";
const CONTROLKEY = "1D740FDE63";

/** URL de un método del agente ContaPyme según la configuración. */
const urlAgente = (cfg, metodo) => `http://${cfg.ip}:${cfg.puerto}${RECURSO}${metodo}`;

/** Devuelve `respuesta` o lanza un error con el `mensaje` del agente si trae `resultado: "false"`. */
function exigirResultado(respuesta) {
    const encabezado = respuesta?.result?.[0]?.encabezado;
    if (encabezado?.resultado !== "true") {
        throw Object.assign(new Error(encabezado?.mensaje || "ContaPyme respondió sin resultado."), { agente: true });
    }
    return respuesta.result[0].respuesta;
}

/**
 * Login en el agente, con la contraseña en MD5 hex en minúsculas (subtarea 1.4).
 * @param {{ip, puerto, email, contrasenaMd5, iapp}} cfg
 * @returns {Promise<string>} keyagente
 */
export async function autenticacion(cfg, { timeoutMs = 15000 } = {}) {
    const parametros = {
        _parameters: [{ email: cfg.email, password: cfg.contrasenaMd5 }, CONTROLKEY, cfg.iapp, "0"],
    };
    const respuesta = await enviarPost(urlAgente(cfg, 'TBasicoGeneral/"GetAuth"/'), parametros, {}, timeoutMs);
    const keyagente = exigirResultado(respuesta)?.datos?.keyagente;
    if (!keyagente) throw Object.assign(new Error("ContaPyme no devolvió la sesión."), { agente: true });
    return keyagente;
}

/**
 * Prueba de conexión: login y una consulta de un registro, que valida el iapp (GetAuth no lo valida).
 * @returns {Promise<{ok: boolean, mensaje: string}>}
 */
export async function probarConexion(cfg) {
    try {
        const keyagente = await autenticacion(cfg, { timeoutMs: 10000 });
        exigirResultado(await obtenerFacturasPorPlazo(cfg, keyagente, { cantidad: "1", timeoutMs: 10000 }));
        return { ok: true, mensaje: "Conexión correcta con ContaPyme." };
    } catch (err) {
        if (err.agente) return { ok: false, mensaje: `ContaPyme rechazó la conexión: ${err.message}` };
        return {
            ok: false,
            mensaje: `No se pudo conectar con ContaPyme en ${cfg.ip}:${cfg.puerto}. ` +
                "Revisa que el agente esté encendido y que la IP y el puerto sean correctos.",
        };
    }
}

/**
 * Una página de la lista de operaciones.
 * @param {{ip, puerto, iapp}} cfg
 */
export async function obtenerFacturasPorPlazo(cfg, keyagente, { pagina = "1", sql, tipos = "ING1", plazo = 0, cantidad = "50", timeoutMs } = {}) {
    const url = urlAgente(cfg, 'TCatOperaciones/"GetListaOperaciones"/');

    const fechaActualUtcMenos5 = moment().tz('America/Bogota');
    const fechaMenosUnaHora = fechaActualUtcMenos5.clone().subtract(parseInt(plazo), 'days');
    const fechaFormateadamenosplazo = fechaMenosUnaHora.format('YYYY-MM-DD');
    const consulta = !sql ? "OprMaest.fcreacion like '%" + fechaFormateadamenosplazo + "%'" : sql;
    console.log(consulta);
    const parametros =
    {
        "_parameters": [
            {
                "datospagina": {
                    "cantidadregistros": cantidad,
                    "pagina": pagina
                },
                "camposderetorno": [
                    "itdoper",
                    "fcreacion",
                    "inumoper",
                    "tdetalle",
                    "ncorto",
                    "iestado",
                    "ntdsop",
                    "ntercero",
                    "iprocess",
                    "fsoport",
                    "snumsop",
                    "qerror",
                    "qwarning",
                    "banulada",
                    "mingresos",
                    "megresos",
                    "mtotaloperacion"
                ],
                "ordenarpor": {
                    "fsoport": "desc"
                },
                "datosfiltro": {
                    "banulada": "F",
                    "itdoper": tipos,
                    "sql": consulta
                }
            },
            keyagente,
            cfg.iapp,
            "0"
        ]
    };

    try {
        const respuesta = await enviarPost(url, parametros, {}, timeoutMs);
        return respuesta;
    } catch (err) {
        console.error("No se pudo completar la solicitud.");
        throw err;
    }
}


export async function ProcesarDatos(loteFacturas, cfg, keyagente) {


    const currency = "COP";
    const nit = cfg.nit;
    const main_sender = nit;
    let consolidado = [];



    for (let index = 0; index < loteFacturas.length; index++) {

        const inumoper_operaciones = loteFacturas[index].inumoper;
        const itdoper_operaciones = loteFacturas[index].itdoper;

        const tercero = await obtenerTercero(cfg, keyagente, nit);
        const detalleFactura = await obtenerDetalleFactura(cfg, keyagente, inumoper_operaciones, itdoper_operaciones);


        // Accesos seguros con optional chaining
        const encabezado = detalleFactura?.result?.[0]?.respuesta?.datos?.encabezado ?? {};
        const datosprincipales = detalleFactura?.result?.[0]?.respuesta?.datos?.datosprincipales ?? {};
        const listaProductos = detalleFactura?.result?.[0]?.respuesta?.datos?.listaproductos ?? [];
        const infoBasicaTercero = tercero?.result?.[0]?.respuesta?.datos?.infobasica ?? {};
        const formaCobro = detalleFactura?.result?.[0]?.respuesta?.datos?.formacobro?.fcobrocxc ?? {};

        let payment_method = 20;
        let qdiascxc = 0;

        if (formaCobro.length > 0) {

            //qdiascxc = formaCobro[0].qdiascxc;
            qdiascxc = 0;
            //console.log(qdiascxc);            
            payment_method = await calcularRango(parseInt(qdiascxc));

            console.log("metodo de pago");
            console.log(payment_method);
        }


        const nitComprador = datosprincipales.init;

        const terceroComprador = await obtenerTercero(cfg, keyagente, nitComprador);

        const infoBasicaTerceroComprador = terceroComprador?.result?.[0]?.respuesta?.datos?.infobasica ?? {};

        const document_type = infoBasicaTerceroComprador.itddocum == '31' ? "A" : "C";
        const document_number = infoBasicaTerceroComprador.init ?? "";
        const verification_digit = infoBasicaTerceroComprador.idigchequeo ?? "";
        const person_type = infoBasicaTerceroComprador.bempresa == 'T' ? "J" : "N";
        const social_reason = infoBasicaTerceroComprador.ntercero ?? "";
        const commercial_name = infoBasicaTerceroComprador.ntercero ?? "";
        const initials = infoBasicaTerceroComprador.ntercero ?? "";
        const statal_entity = infoBasicaTerceroComprador.sclasiflegal.includes("EE;");
        const consortium = infoBasicaTerceroComprador.sclasiflegal.includes("CN;");
        const aggregation_code = 3;
        const city_code = `${infoBasicaTerceroComprador.idep ?? ""}${infoBasicaTerceroComprador.imun ?? ""}`.trim();
        const country_code = `${infoBasicaTerceroComprador.ipais ?? ""}`.trim();
        const first_name = infoBasicaTerceroComprador.ntercero ?? "";
        const last_name = infoBasicaTerceroComprador.napellido.split(" ")[0] ?? "";
        const secondary_last_name = infoBasicaTerceroComprador.napellido.split(" ")[1] ?? "";

        // -- OJO: valida la lógica. Ahora mismo tu código siempre ponía "V".
        const operation_type = encabezado.itdoper === "ING1" ? "V" : "C"; // <-- Ajusta según regla real
        const delivery_warehouse = encabezado.itdoper === "ING1" ? "V" : "C"; // <-- Ajusta según corresponda

        // Fechas
        const issueDateRaw = encabezado.fsoport;
        const issueDate = moment(issueDateRaw, "MM/DD/YYYY", true);
        const fsoport = issueDate.isValid()
            ? issueDate.format("YYYY-MM-DD")
            : (() => {
                throw new Error(`Fecha inválida en fsoport: "${issueDateRaw}"`);
            })();

        const createDate = encabezado.fcreacion;
        const createDateCovert = moment(createDate, "MM/DD/YYYY", true);
        const fechaMasQdias = createDateCovert.clone().add(parseInt(qdiascxc), 'days');
        const operation_expiration_date = fechaMasQdias.isValid()
            ? fechaMasQdias.format("YYYY-MM-DD")
            : (() => {
                throw new Error(`Fecha inválida en fcreacion: "${createDate}"`);
            })();

        // Códigos de envío
        const delivery_city_code = `${infoBasicaTercero.idep ?? ""}${infoBasicaTercero.imun ?? ""}`.trim();
        const delivery_country_code = `${infoBasicaTercero.ipais ?? ""}`.trim();


        // Validaciones mínimas (puedes usar zod/joi si quieres algo formal)
        if (!encabezado.snumsop || !encabezado.fsoport) {
            // decide si saltas o lanzas error
            throw new Error(`Encabezado incompleto para operación ${inumoper}`);
        }

        const operation_id = `${encabezado.snumsop ?? ""}`.trim();
        const total_value = Number(encabezado.mtotaloperacion) || 0;
        const end_value = Number(encabezado.mtotaloperacion) || 0;


        // Productos
        const products = listaProductos.map((p) => ({
            product: p?.irecurso ?? "",
            quantity: Number(p?.qproducto) || 0,
            unitary_price: Number(p?.mprecio) || 0,
            tax: (Number(p?.qporciva) || 0) / 100,
            total_price: Number(p?.mvrtotal) || 0,
        }));


        const payloadFaktur = {
            complete_invoice: true,
            operation_id,                          // snumsop + fsoport
            operation_type,                        // según regla
            operation_issue_date: fsoport,         // YYYY-MM-DD
            operation_expiration_date,    // mismo día (valida esto)
            currency,                              // constante (COP)
            main_sender,                           // NIT
            // Si realmente necesitas secondary_sender fijo, déjalo,
            // pero idealmente viene de config o de datos de negocio:
            secondary_sender: {
                document_type,
                document_number,
                verification_digit,
                person_type,
                commercial_name,
                initials,
                statal_entity,
                consortium,
                aggregation_code,
                city_code,
                country_code,
            },
            total_value,                           // enc.mtotaloperacion
            end_value,                             // enc.mtotaloperacion
            delivery_city_code,                    // tercero.idep + tercero.imun (revisar formato)
            delivery_country_code,                 // tercero.ipais
            payment_method,                     // fija (considera parametrizar)
            delivery_warehouse,                    // según regla
            products,
        };

        if (payloadFaktur.secondary_sender.person_type === 'J') {
            payloadFaktur.secondary_sender.social_reason = social_reason;
        }
        else {
            payloadFaktur.secondary_sender.first_name = first_name;
            payloadFaktur.secondary_sender.last_name = last_name;
            payloadFaktur.secondary_sender.secondary_last_name = secondary_last_name;
        }

        consolidado.push(payloadFaktur);
    }

    return consolidado;
}


//Funcion para obtener el detalle de la factura
async function obtenerDetalleFactura(cfg, keyagente, inumoper, itdoper) {
    const url = urlAgente(cfg, 'TCatOperaciones/"DoExecuteOprAction"/');

    console.log("URL generada:", url);

    const parametros =
    {
        "_parameters": [
            {
                "accion": "LOAD",
                "operaciones": [
                    {
                        "inumoper": inumoper,
                        "itdoper": itdoper
                    }
                ]
            },
            keyagente,
            cfg.iapp,
            "0"
        ]
    };
    try {
        const respuesta = await enviarPost(url, parametros);
        return respuesta;
    } catch (err) {
        console.error("No se pudo completar la solicitud.");
        throw err;
    }
}

//Funcion para obtener el detalle de la factura
async function obtenerTercero(cfg, keyagente, nit) {
    const url = urlAgente(cfg, 'TCatTerceros/"GetInfoTercero"/');

    console.log("URL generada:", url);

    const parametros =
    {
        "_parameters": [
            {
                "init": nit

            },
            keyagente,
            cfg.iapp
        ]
    };
    try {
        const respuesta = await enviarPost(url, parametros);
        return respuesta;
    } catch (err) {
        console.error("No se pudo completar la solicitud.");
        throw err;
    }
}


export async function enviarFacturasProcesadas(cfg, keyagente, tipos, sql) {
    const paginasFacturas = await obtenerFacturasPorPlazo(cfg, keyagente, { pagina: "1", sql, tipos });

    const paginas = paginasFacturas?.result[0]?.respuesta?.paginacion?.totalpaginas ?? false;


    if (!paginas) {
        console.log("NO HAY FACTURAS PARA ACTUALIZAR");
        return;
    }

    for (let index = 1; index <= paginas; index++) {
        const loteFacturas = await obtenerFacturasPorPlazo(cfg, keyagente, { pagina: index, sql, tipos });
        const procesados = await ProcesarDatos(loteFacturas.result[0].respuesta.datos, cfg, keyagente);

        console.log(JSON.stringify(procesados));

        await enviarFacturasFaktur(procesados, cfg);


    }
}

/** Pequeña utilidad para esperar ms */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Decide si vale la pena reintentar según el error */
function esReintentable(err) {
    // Timeouts/errores de red (sin response) -> reintentar
    if (!err.response) return true;

    const { status } = err.response;
    // 5xx -> reintentar. 429 -> reintentar (rate limit)
    if (status >= 500 || status === 429) return true;

    // Otros 4xx (400, 401, 403, 404, 422, etc.) normalmente NO son transitorios
    return false;
}

/**
 * Ejecuta una función async con reintentos y backoff exponencial + jitter
 * @param {() => Promise<any>} fn
 * @param {{intentos?: number, baseMs?: number, maxMs?: number, factor?: number, onRetry?:(info)=>void}} opts
 */
async function conReintentos(fn, opts = {}) {
    const {
        intentos = 5,        // intentos totales (1 intento inicial + 4 reintentos)
        baseMs = 500,        // espera inicial
        maxMs = 8000,        // espera máxima
        factor = 2,          // multiplicador exponencial
        onRetry = () => { },  // callback para loggear
    } = opts;

    let intento = 0;
    let ultimoError;

    while (intento < intentos) {
        try {
            return await fn();
        } catch (err) {
            ultimoError = err;
            intento++;

            // Si no reintentamos o agotamos intentos -> relanzar
            if (!esReintentable(err) || intento >= intentos) {
                throw err;
            }

            // Backoff exponencial + jitter (0-30%)
            const delayBase = Math.min(baseMs * Math.pow(factor, intento - 1), maxMs);
            const jitter = Math.floor(delayBase * (Math.random() * 0.3));
            const delay = delayBase + jitter;

            onRetry({
                intento,
                intentosTotales: intentos,
                delay,
                status: err.response?.status,
                mensaje: err.message,
            });

            await sleep(delay);
        }
    }

    // Por si acaso (no debería llegar acá)
    throw ultimoError;
}

async function crearFactura(data, cfg, { timeoutMs = 15000 } = {}) {
    const apiUrl = cfg.fakturUrl;
    const config = {
        headers: {
            Authorization: `Token ${cfg.fakturToken}`,
            "Content-Type": "application/json",
        },
        timeout: timeoutMs, // timeout defensivo por petición
    };

    return axios.post(apiUrl, data, config);
}

/**
 * Envío en paralelo con reintentos individuales por factura.
 * Limita logs y muestra un resumen final.
 */
async function enviarFacturasFaktur(procesados, cfg) {
    const intentos = 3; // intentos configurados en conReintentos

    const tareas = procesados.map((data, idx) =>
        conReintentos(
            () => crearFactura(data, cfg),
            {
                intentos,
                baseMs: 600,
                maxMs: 10000,
                factor: 2,
                onRetry: ({ intento, intentosTotales, delay, status, mensaje }) => {
                    console.warn(
                        `[Item ${idx}] Reintento ${intento}/${intentosTotales} en ${delay} ms. ` +
                        `status=${status ?? "NET"}, msg=${mensaje}`
                    );
                },
            }
        )
    );

    const resultadoEnvio = await Promise.allSettled(tareas);

    // IMPORTANTE: necesitamos await, así que usamos for..of
    for (let i = 0; i < resultadoEnvio.length; i++) {
        const result = resultadoEnvio[i];
        const data = procesados[i];
        const operationId = data.operation_id; // viene del payloadFaktur

        if (result.status === "fulfilled") {
            const res = result.value; // AxiosResponse
            const httpStatus = res?.status ?? null;
            const responseBody = res?.data;

            // Guardamos en SQLite
            guardarLogFactura({
                operationId,
                success: true,
                httpStatus,
                intento: intentos,   // número de intentos configurado (si quieres algo más fino luego lo cambiamos)
                requestBody: data,
                responseBody,
                errorMessage: null,
            });

            // Si quieres, puedes seguir logueando por consola/Winston:
            // logger.info("Factura enviada OK", { item: i, status: httpStatus, operationId });
        } else {
            const err = result.reason;
            const httpStatus = err?.response?.status ?? null;
            const responseBody = err?.response?.data ?? null;
            const errorMessage = err?.message || String(err);

            guardarLogFactura({
                operationId,
                success: false,
                httpStatus,
                intento: intentos,
                requestBody: data,
                responseBody,
                errorMessage,
            });

            // logger.error("Factura falló tras reintentos", { item: i, status: httpStatus, operationId, errorMessage });
        }
    }

    // Resumen final (puedes dejarlo igual)
    const ok = resultadoEnvio.filter((r) => r.status === "fulfilled").length;
    const fail = resultadoEnvio.length - ok;

    console.log(`Resumen envío a Faktur: OK=${ok}, FAIL=${fail}, TOTAL=${resultadoEnvio.length}`);

    return { ok, fail, total: resultadoEnvio.length };
}



//funciones del logger seguras
// ==== Helpers de logging seguro ====
function redactHeaders(headers = {}) {
    const h = { ...headers };
    if ("authorization" in h) h.authorization = "***";
    if ("Authorization" in h) h.Authorization = "***";
    if ("x-api-key" in h) h["x-api-key"] = "***";
    if ("X-API-Key" in h) h["X-API-Key"] = "***";
    return h;
}

function truncate(str, max = 2000) {
    if (typeof str !== "string") str = String(str ?? "");
    return str.length > max ? str.slice(0, max) + "…[truncado]" : str;
}

function safeBody(body) {
    try {
        const obj =
            typeof body === "string" ? JSON.parse(body) : body && typeof body === "object" ? { ...body } : body;

        if (obj && typeof obj === "object") {
            for (const k of Object.keys(obj)) {
                if (/(password|pass|token|secret|authorization)/i.test(k)) obj[k] = "***";
            }
            return truncate(JSON.stringify(obj));
        }
        return truncate(String(body ?? ""));
    } catch {
        return truncate(String(body ?? ""));
    }
}

function dumpReq(config = {}) {
    return {
        method: (config.method || "GET").toUpperCase(),
        url: config.url,
        headers: redactHeaders(config.headers || {}),
        data: safeBody(config.data),
        timeout: config.timeout,
    };
}


async function calcularRango(numero) {
    console.log(numero);
    const formasDePago = {
        "rangos": [
            {
                "rango": [0, 0],
                "codigo": 1
            },

            {
                "rango": [0, 1],
                "codigo": 284
            },

            {
                "rango": [1, 3],
                "codigo": 135
            },

            {
                "rango": [3, 7],
                "codigo": 7
            },

            {
                "rango": [7, 8],
                "codigo": 27
            },

            {
                "rango": [8, 10],
                "codigo": 104
            },

            {
                "rango": [10, 15],
                "codigo": 102
            },

            {
                "rango": [15, 20],
                "codigo": 107
            },

            {
                "rango": [20, 45],
                "codigo": 125
            },

            {
                "rango": [45, 59],
                "codigo": 270
            },

            {
                "rango": [59, 99],
                "codigo": 20
            },
            {
                "rango": [99, 210],
                "codigo": 286
            }
        ]
    };


    for (let index = 0; index < formasDePago.rangos.length; index++) {
        const minimo = formasDePago.rangos[index].rango[0];
        const maximo = formasDePago.rangos[index].rango[1];

        if (numero >= minimo && numero <= maximo) {
            return formasDePago.rangos[index].codigo;
        }

    }
}