// autenticacion.mjs
import axios from "axios";
import moment from 'moment-timezone';
import logger from "./logger.mjs";

/**
 * Función auxiliar para enviar POST
 */
export async function enviarPost(url, data, headers = {}) {
    try {
        const response = await axios.post(url, data, { headers });
        return response.data;
    } catch (error) {
        console.error("Error en la petición:", error.message);
        throw error;
    }
}

/**
 * Función de autenticación
 * @param {string} ip - Dirección IP del servicio
 * @param {number|string} puerto - Puerto del servicio
 * @param {string} recurso1 - Parte base de la ruta
 */
export async function autenticacion(ip, puerto, recurso1, email, password, idMaquina) {
    const recurso2 = 'TBasicoGeneral/"GetAuth"/';
    const url = `http://${ip}:${puerto}${recurso1}${recurso2}`;

    console.log("URL generada:", url);

    const parametros =
    {
        "_parameters":
            [
                {
                    email: email,
                    password: password,
                    userId: idMaquina,
                },
                "1D740FDE63",
                idMaquina,
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



/**
 * Función de Obtener Facturas
 * @param {string} ip - Dirección IP del servicio
 * @param {number|string} puerto - Puerto del servicio
 * @param {string} recurso1 - Parte base de la ruta
 */
export async function obtenerFacturasPorPlazo(ip, puerto, recurso1, iapp, plazo, tipos_de_facturas, keyagente, pagina, sql) {
    const recurso2 = 'TCatOperaciones/"GetListaOperaciones"/';
    const url = `http://${ip}:${puerto}${recurso1}${recurso2}`;

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
                    "cantidadregistros": "50",
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
                    "itdoper": tipos_de_facturas,
                    "sql": consulta
                }
            },
            keyagente,
            iapp,
            "0"
        ]
    };

    console.log(url);
    console.log(JSON.stringify(parametros));

    try {
        const respuesta = await enviarPost(url, parametros);
        return respuesta;
    } catch (err) {
        console.error("No se pudo completar la solicitud.");
        throw err;
    }
}


//funciones para traer clientes
/**
 * Obtiene los datos de un usuario desde un servicio con autenticación Basic
 * @param {number} userId - ID del usuario a consultar
 * @returns {Promise<object>} - Datos del usuario
 */
export async function obtenerUsuario(userId) {
    // Endpoint base
    const url = `https://facturas.dzdigital.com.co/wp-json/wp/v2/users/${userId}`;

    // Usuario y contraseña
    const username = "admin";
    const password = process.env.WP_APP_PASSWORD;

    // Codificar en Base64
    const token = Buffer.from(`${username}:${password}`).toString("base64");

    try {
        const resp = await axios.get(url, {
            headers: {
                Authorization: `Basic ${token}`,
            },
        });

        return resp.data;
    } catch (error) {
        console.error("Error obteniendo usuario:", error.response?.status, error.message);
        throw error;
    }
}



export async function ProcesarDatos(loteFacturas, nit, ip_del_servidor, puerto, recurso1, iapp, keyagente) {


    const currency = "COP";
    const main_sender = nit;
    let consolidado = [];



    for (let index = 0; index < loteFacturas.length; index++) {

        const inumoper_operaciones = loteFacturas[index].inumoper;
        const itdoper_operaciones = loteFacturas[index].itdoper;

        const tercero = await obtenerTercero(ip_del_servidor, puerto, recurso1, nit, keyagente, iapp);
        const detalleFactura = await obtenerDetalleFactura(ip_del_servidor, puerto, recurso1, iapp, keyagente, inumoper_operaciones, itdoper_operaciones);


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

        const terceroComprador = await obtenerTercero(ip_del_servidor, puerto, recurso1, nitComprador, keyagente, iapp);

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
async function obtenerDetalleFactura(ip, puerto, recurso1, iapp, keyagente, inumoper, itdoper) {
    const recurso2 = 'TCatOperaciones/"DoExecuteOprAction"/';
    const url = `http://${ip}:${puerto}${recurso1}${recurso2}`;

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
            iapp,
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
async function obtenerTercero(ip, puerto, recurso1, nit, keyagente, iapp) {

    const recurso2 = 'TCatTerceros/"GetInfoTercero"/';
    const url = `http://${ip}:${puerto}${recurso1}${recurso2}`;

    console.log("URL generada:", url);

    const parametros =
    {
        "_parameters": [
            {
                "init": nit

            },
            keyagente,
            iapp
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


export async function enviarFacturasProcesadas(nit, ip_del_servidor, puerto, recurso1, keyagente, iapp, plazo, tipos_de_facturas, sql) {
    const paginasFacturas = await obtenerFacturasPorPlazo(ip_del_servidor, puerto, recurso1, iapp, plazo, tipos_de_facturas, keyagente, "1", sql);

    const paginas = paginasFacturas?.result[0]?.respuesta?.paginacion?.totalpaginas ?? false;


    if (!paginas) {
        console.log("NO HAY FACTURAS PARA ACTUALIZAR");
        return;
    }

    for (let index = 1; index <= paginas; index++) {
        const loteFacturas = await obtenerFacturasPorPlazo(ip_del_servidor, puerto, recurso1, iapp, plazo, tipos_de_facturas, keyagente, index, sql);
        const procesados = await ProcesarDatos(loteFacturas.result[0].respuesta.datos, nit, ip_del_servidor, puerto, recurso1, iapp, keyagente);

        console.log(JSON.stringify(procesados));

        //await enviarFacturasFaktur(procesados);


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

async function crearFactura(data, { timeoutMs = 15000 } = {}) {
    const apiUrl = "https://develop.faktur.co/api/operations/";
    const config = {
        headers: {
            Authorization: `Token ${process.env.FAKTUR_TOKEN}`,
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
export async function enviarFacturasFaktur(procesados) {
    const intentos = 3;

    const tareas = procesados.map((data, idx) =>
        conReintentos(
            () => crearFactura(data),
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

    // Logs individuales
    resultadoEnvio.forEach((result, i) => {
        if (result.status === "fulfilled") {
            // Axios: result.value suele ser la Response
            const res = result.value;
            const reqConfig = res?.config ?? {};

            console.log(reqConfig.data);
            /*logger.info("Factura enviada OK", {
                item: i,
                status: res?.status,
                req: dumpReq(reqConfig),
                resHeaders: res?.headers,
            });*/
        } else {
            const err = result.reason;
            const status = err?.response?.status ?? "NET";
            const data = err?.response?.data;
            /*logger.error("Factura falló tras reintentos", {
                item: i,
                intentos,
                status,
                msg: err?.message || String(err),
                req: dumpReq(err?.config),
                // No volcamos todo 'data' crudo si es enorme:
                resData: typeof data === "object" ? truncate(JSON.stringify(data)) : truncate(String(data ?? "")),
            });*/
        }
    });

    // Resumen final
    const ok = resultadoEnvio.filter((r) => r.status === "fulfilled").length;
    const fail = resultadoEnvio.length - ok;
    //logger.info("Resumen envío facturas", { ok, fail, total: resultadoEnvio.length });

    return resultadoEnvio;
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