// Pantalla "Historial" (subtarea 4.5): envíos anteriores con filtros, paginación y detalle.
import { $, mostrarMensaje, pedir } from "./comun.js";

const POR_PAGINA = 25;
let pagina = 1;
let total = 0;

/** "2026-11-25T10:31:02-05:00" → "2026-11-25 10:31". */
const fecha = (iso) => String(iso ?? "").replace("T", " ").slice(0, 16);

/** JSON guardado como texto → texto legible. */
function formatear(texto) {
    if (!texto) return "(nada)";
    try {
        return JSON.stringify(JSON.parse(texto), null, 2);
    } catch {
        return texto;
    }
}

function insignia(ok) {
    const b = document.createElement("span");
    b.className = `badge ${ok ? "text-bg-success" : "text-bg-danger"}`;
    b.textContent = ok ? "Enviada" : "Fallida";
    return b;
}

async function cargar() {
    const params = new URLSearchParams({ page: String(pagina), pageSize: String(POR_PAGINA) });
    const factura = $("h-factura").value.trim();
    if (factura) params.set("operation_id", factura);
    if ($("h-resultado").value) params.set("success", $("h-resultado").value);

    const { status, datos } = await pedir(`/logs/facturas?${params}`);
    if (status !== 200) return mostrarMensaje("mensaje-historial", datos.mensaje, "danger");
    $("mensaje-historial").hidden = true;
    total = datos.count;

    const cuerpo = $("tabla-historial").tBodies[0];
    cuerpo.replaceChildren();
    for (const r of datos.data) {
        const fila = cuerpo.insertRow();
        fila.insertCell().textContent = fecha(r.created_at);
        fila.insertCell().textContent = r.operation_id;
        fila.insertCell().append(insignia(r.success === 1));
        fila.insertCell().textContent = r.intento ?? "";
        const motivo = fila.insertCell();
        motivo.textContent = r.error_message ?? "";
        motivo.className = "small";
        const ver = document.createElement("button");
        Object.assign(ver, { type: "button", className: "btn btn-link btn-sm", textContent: "Ver" });
        ver.addEventListener("click", () => verDetalle(r.id));
        fila.insertCell().append(ver);
    }
    if (!datos.data.length) {
        const celda = cuerpo.insertRow().insertCell();
        celda.colSpan = 6;
        celda.className = "text-secondary";
        celda.textContent = factura || $("h-resultado").value ? "No hay envíos con ese filtro." : "Todavía no se ha enviado ninguna factura.";
    }

    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    $("h-pagina").textContent = `Página ${pagina} de ${paginas} · ${total} registros`;
    $("h-anterior").disabled = pagina <= 1;
    $("h-siguiente").disabled = pagina >= paginas;
}

async function verDetalle(id) {
    const { status, datos } = await pedir(`/logs/facturas/${id}`);
    if (status !== 200) return mostrarMensaje("mensaje-historial", datos.mensaje, "danger");
    const r = datos.data;
    $("titulo-detalle").textContent = `Factura ${r.operation_id}`;
    const http = r.http_status ? ` · respuesta HTTP ${r.http_status}` : "";
    $("resumen-detalle").textContent =
        `${r.success === 1 ? "Enviada" : "Fallida"} el ${fecha(r.created_at)} · ${r.intento ?? 0} intento(s)${http}` +
        (r.error_message ? `. Motivo: ${r.error_message}` : "");
    $("enviado-detalle").textContent = formatear(r.request_body);
    $("respuesta-detalle").textContent = formatear(r.response_body);
    bootstrap.Modal.getOrCreateInstance($("modal-detalle")).show();
}

$("form-historial").addEventListener("submit", (ev) => {
    ev.preventDefault();
    pagina = 1;
    cargar();
});
$("h-anterior").addEventListener("click", () => {
    pagina--;
    cargar();
});
$("h-siguiente").addEventListener("click", () => {
    pagina++;
    cargar();
});

/** Al entrar a la pantalla: recarga la página actual con los filtros puestos. */
export function iniciarHistorial() {
    cargar();
}
