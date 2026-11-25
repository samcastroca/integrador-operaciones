// 1.9 — Valida Faktur de PRUEBAS: envía una operación armada a mano (datos inventados) y una inválida,
// y guarda ambas respuestas en fixtures/faktur/ con el NIT emisor sustituido.
// Uso: node --env-file=.env scripts/exploracion/faktur.mjs
import axios from "axios";
import { mkdirSync, writeFileSync } from "node:fs";

const url = process.env.FAKTUR_URL || "https://develop.faktur.co/api/operations/";
const token = process.env.FAKTUR_TOKEN;
const emisor = process.env.CP_NIT;
if (!token || !emisor) throw new Error("Faltan FAKTUR_TOKEN y CP_NIT en .env");
if (!url.includes("develop.")) throw new Error(`FAKTUR_URL no es el entorno de pruebas: ${url}`);

const hoy = new Date().toISOString().slice(0, 10);
const valida = {
    complete_invoice: true,
    operation_id: `PRUEBA-${Date.now()}`,
    operation_type: "V",
    operation_issue_date: hoy,
    operation_expiration_date: hoy,
    currency: "COP",
    main_sender: emisor,
    secondary_sender: {
        document_type: "C",
        document_number: "1010101010",
        verification_digit: "0",
        person_type: "N",
        commercial_name: "PRUEBA INTEGRADOR",
        initials: "PRUEBA INTEGRADOR",
        statal_entity: false,
        consortium: false,
        aggregation_code: 3,
        city_code: "63001",
        country_code: "169",
        first_name: "PRUEBA",
        last_name: "INTEGRADOR",
        secondary_last_name: "",
    },
    total_value: 1000,
    end_value: 1000,
    delivery_city_code: "63001",
    delivery_country_code: "169",
    payment_method: 20,
    delivery_warehouse: "V",
    products: [{ product: "P998", quantity: 1, unitary_price: 1000, tax: 0, total_price: 1000 }],
};
const invalida = { ...valida, operation_id: `PRUEBA-ERR-${Date.now()}`, operation_issue_date: "fecha-invalida", products: [] };

async function enviar(cuerpo) {
    try {
        const r = await axios.post(url, cuerpo, { headers: { Authorization: `Token ${token}` }, timeout: 20000 });
        return { status: r.status, enviado: cuerpo, respuesta: r.data };
    } catch (err) {
        if (!err.response) throw err;
        return { status: err.response.status, enviado: cuerpo, respuesta: err.response.data };
    }
}

const anonimizar = (obj) => JSON.parse(JSON.stringify(obj).replaceAll(emisor, "900999999"));
const carpeta = new URL("../../fixtures/faktur/", import.meta.url);
mkdirSync(carpeta, { recursive: true });

for (const [nombre, cuerpo] of [["exito", valida], ["error", invalida]]) {
    const r = await enviar(cuerpo);
    writeFileSync(new URL(`respuesta-${nombre}.json`, carpeta), JSON.stringify(anonimizar(r), null, 2) + "\n");
    console.log(`${nombre}: HTTP ${r.status} ${JSON.stringify(r.respuesta).slice(0, 400)}`);
}
