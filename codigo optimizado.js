// Supón que importas moment y tus helpers arriba
// import moment from "moment";
// import { obtenerTercero, obtenerDetalleFactura } from "./servicios.js";

export async function procesarDatos(
    loteFacturas,
    { nit, ip_del_servidor, puerto, recurso1, iapp, keyagente }
) {
    const currency = "COP";
    const main_sender = nit;

    const consolidado = [];

    for (const factura of loteFacturas) {
        const inumoper = factura?.inumoper;
        const itdoper = factura?.itdoper;

        // Lanza ambas peticiones en paralelo (más rápido que hacer await una por una)
        const [tercero, detalleFactura] = await Promise.all([
            obtenerTercero(ip_del_servidor, puerto, recurso1, nit, keyagente, iapp),
            obtenerDetalleFactura(ip_del_servidor, puerto, recurso1, iapp, keyagente, inumoper, itdoper),
        ]);

        // Accesos seguros con optional chaining
        const enc = detalleFactura?.result?.[0]?.respuesta?.datos?.encabezado ?? {};
        const listaProductos = detalleFactura?.result?.[0]?.respuesta?.datos?.listaproductos ?? [];
        const infoBasica = tercero?.result?.[0]?.respuesta?.datos?.infobasica ?? {};

        // -- OJO: valida la lógica. Ahora mismo tu código siempre ponía "V".
        const operation_type = enc.itdoper === "ING1" ? "I" : "V"; // <-- Ajusta según regla real
        const delivery_warehouse = enc.itdoper === "ING1" ? "I" : "V"; // <-- Ajusta según corresponda

        // Fechas
        const issueDateRaw = enc.fsoport;
        const issueDate = moment(issueDateRaw, "MM/DD/YYYY", true);
        const fsoport = issueDate.isValid()
            ? issueDate.format("YYYY-MM-DD")
            : null; // o lánzalo como error si es requerido

        // Códigos de envío
        const delivery_city_code = `${infoBasica.idep ?? ""}${infoBasica.imun ?? ""}`.trim();
        const delivery_country_code = `${infoBasica.ipais ?? ""}`.trim();

        // Productos
        const products = listaProductos.map((p) => ({
            product: p?.irecurso ?? "",
            quantity: Number(p?.qproducto) || 0,
            unitary_price: Number(p?.mprecio) || 0,
            tax: (Number(p?.qporciva) || 0) / 100,
            total_price: Number(p?.mvrtotal) || 0,
        }));

        // Validaciones mínimas (puedes usar zod/joi si quieres algo formal)
        if (!enc.snumsop || !enc.fsoport) {
            // decide si saltas o lanzas error
            // throw new Error(`Encabezado incompleto para operación ${inumoper}`);
        }

        const operation_id = `${enc.snumsop ?? ""} ${enc.fsoport ?? ""}`.trim();
        const total_value = Number(enc.mtotaloperacion) || 0;
        const end_value = Number(enc.mtotaloperacion) || 0;

        const payloadFaktur = {
            complete_invoice: true,
            operation_id,                          // snumsop + fsoport
            operation_type,                        // según regla
            operation_issue_date: fsoport,         // YYYY-MM-DD
            operation_expiration_date: fsoport,    // mismo día (valida esto)
            currency,                              // constante (COP)
            main_sender,                           // NIT
            // Si realmente necesitas secondary_sender fijo, déjalo,
            // pero idealmente viene de config o de datos de negocio:
            secondary_sender: {
                document_type: "A",
                document_number: "123456789",
                verification_digit: "5",
                person_type: "J",
                social_reason: "Mandante secundario",
                commercial_name: "Mandante secundario",
                initials: "MS",
                statal_entity: false,
                consortium: false,
                aggregation_code: 3,
                city_code: "76001",
                country_code: "169",
            },
            total_value,                           // enc.mtotaloperacion
            end_value,                             // enc.mtotaloperacion
            delivery_city_code,                    // tercero.idep + tercero.imun (revisar formato)
            delivery_country_code,                 // tercero.ipais
            payment_method: 1,                     // fija (considera parametrizar)
            delivery_warehouse,                    // según regla
            products,
        };

        consolidado.push(payloadFaktur);
    }

    return consolidado;
}
