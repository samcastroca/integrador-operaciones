// Pantalla "Enviar facturas" (subtarea 3.10): consultar, elegir, enviar y seguir el progreso.
import { $, mostrarMensaje, pedir } from "./comun.js";

const form = $("form-consulta");
const pesos = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
let facturas = [];
/** Hay un envío en curso: no se puede consultar ni enviar hasta que termine. */
let enviando = false;
/** Fallos de red seguidos tolerados al seguir el progreso antes de rendirse. */
const MAX_FALLOS_RED = 5;

function bloquear(activo) {
    enviando = activo;
    $("consultar").disabled = activo;
    actualizarBoton();
}

function mostrarModo() {
    const modo = form.elements.modo.value;
    for (const m of ["dia", "rango", "numeros"]) $(`modo-${m}`).hidden = m !== modo;
}

// Mismas reglas que filtro.mjs en el servidor (subtarea 4.3).
const NUMERO = /^[A-Za-z0-9-]{1,30}$/;
const MAX_NUMEROS = 200;
const CAMPOS_CONSULTA = ["fecha", "desde", "hasta", "numeros"];

/** Marca el campo `id` como inválido con `texto`, o lo limpia si `texto` es vacío. */
function marcar(id, texto) {
    $(id).classList.toggle("is-invalid", !!texto);
    $(`error-${id}`).textContent = texto;
    return !texto;
}

/** La consulta del formulario, o `null` si algo no es válido (los campos quedan marcados). */
function leerConsulta() {
    for (const id of CAMPOS_CONSULTA) marcar(id, "");
    const modo = form.elements.modo.value;
    // El selector de fecha deja `value` vacío si la fecha escrita no existe (p. ej. 31/02).
    if (modo === "dia") {
        return marcar("fecha", $("fecha").value ? "" : "Elige una fecha válida.") ? { modo, fecha: $("fecha").value } : null;
    }
    if (modo === "rango") {
        const desde = $("desde").value;
        const hasta = $("hasta").value;
        let ok = marcar("desde", desde ? "" : "Elige la fecha inicial.");
        ok = marcar("hasta", hasta ? "" : "Elige la fecha final.") && ok;
        if (ok && desde > hasta) ok = marcar("hasta", "Debe ser igual o posterior a la fecha inicial.");
        return ok ? { modo, desde, hasta } : null;
    }
    const numeros = $("numeros").value.split(/[\s,;]+/).filter(Boolean);
    const malo = numeros.find((n) => !NUMERO.test(n));
    const error = !numeros.length ? "Escribe al menos un número de factura."
        : malo !== undefined ? `"${malo}" no es un número válido: solo letras, números y guiones.`
            : numeros.length > MAX_NUMEROS ? `Se pueden consultar hasta ${MAX_NUMEROS} números a la vez.`
                : "";
    return marcar("numeros", error) ? { modo, numeros } : null;
}

function seleccionadas() {
    return [...document.querySelectorAll(".sel-factura:checked")].map((c) => c.value);
}

function actualizarBoton() {
    const n = seleccionadas().length;
    $("btn-enviar").disabled = enviando || n === 0;
    $("btn-enviar").textContent = `Enviar a Faktur (${n})`;
}

function pintarLista() {
    const cuerpo = $("tabla-facturas").tBodies[0];
    cuerpo.replaceChildren();
    for (const f of facturas) {
        const fila = cuerpo.insertRow();
        const casilla = document.createElement("input");
        Object.assign(casilla, { type: "checkbox", className: "form-check-input sel-factura", value: f.inumoper, checked: !f.yaEnviada });
        casilla.setAttribute("aria-label", `Elegir ${f.snumsop}`);
        fila.insertCell().append(casilla);
        fila.insertCell().textContent = f.snumsop;
        fila.insertCell().textContent = f.fecha;
        fila.insertCell().textContent = f.tercero;
        const total = fila.insertCell();
        total.textContent = pesos.format(f.total);
        total.className = "text-end";
        const estado = fila.insertCell();
        if (f.yaEnviada) {
            const marca = document.createElement("span");
            marca.className = "badge text-bg-success";
            marca.textContent = "Ya enviada";
            estado.append(marca);
        }
    }
    $("todas").checked = false;
    $("lista").hidden = facturas.length === 0;
    actualizarBoton();
}

form.elements.modo.forEach((r) => r.addEventListener("change", mostrarModo));

form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (enviando) return;
    const consulta = leerConsulta();
    if (!consulta) return;
    $("consultar").disabled = true;
    $("lista").hidden = true;
    $("progreso").hidden = true;
    mostrarMensaje("mensaje-envio", "Consultando ContaPyme…", "secondary");
    const { status, datos } = await pedir("/api/facturas/consultar", { method: "POST", body: consulta });
    $("consultar").disabled = false;
    if (status !== 200) return mostrarMensaje("mensaje-envio", datos.mensaje, "danger");
    facturas = datos.facturas;
    const enviadas = facturas.filter((f) => f.yaEnviada).length;
    mostrarMensaje(
        "mensaje-envio",
        facturas.length
            ? `${facturas.length} facturas encontradas${enviadas ? `, ${enviadas} ya enviadas (desmarcadas)` : ""}.`
            : "No hay facturas para esa consulta.",
        facturas.length ? "info" : "warning",
    );
    pintarLista();
});

$("todas").addEventListener("change", (ev) => {
    document.querySelectorAll(".sel-factura").forEach((c) => (c.checked = ev.target.checked));
    actualizarBoton();
});
$("tabla-facturas").addEventListener("change", (ev) => {
    if (ev.target.classList.contains("sel-factura")) actualizarBoton();
});

async function seguir(id) {
    $("progreso").hidden = false;
    $("reintentar").hidden = true;
    $("tabla-fallidas").hidden = true;
    let fallosRed = 0;
    for (; ;) {
        const { status, datos } = await pedir(`/api/envios/${id}`);
        if (status === 0 && ++fallosRed < MAX_FALLOS_RED) {
            await new Promise((r) => setTimeout(r, 1000));
            continue;
        }
        if (status !== 200) {
            bloquear(false);
            const mensaje = status === 404
                ? "Se perdió el seguimiento del envío (¿se reinició el integrador?). Vuelve a consultar para ver qué facturas quedaron enviadas."
                : datos.mensaje;
            return mostrarMensaje("mensaje-envio", mensaje, "danger");
        }
        fallosRed = 0;
        const pct = datos.total ? Math.round((100 * datos.procesadas) / datos.total) : 0;
        $("barra").style.width = `${pct}%`;
        $("barra").parentElement.setAttribute("aria-valuenow", String(pct));
        $("contador").textContent = `${datos.procesadas} de ${datos.total}`;
        if (datos.terminado) return mostrarResultado(id, datos);
        await new Promise((r) => setTimeout(r, 500));
    }
}

function mostrarResultado(id, { resultados }) {
    const fallidas = resultados.filter((r) => !r.ok);
    const ok = resultados.length - fallidas.length;
    mostrarMensaje(
        "mensaje-envio",
        `Envío terminado: ${ok} enviadas, ${fallidas.length} fallidas.`,
        fallidas.length ? "warning" : "success",
    );
    const cuerpo = $("tabla-fallidas").tBodies[0];
    cuerpo.replaceChildren();
    for (const r of fallidas) {
        const fila = cuerpo.insertRow();
        fila.insertCell().textContent = r.snumsop ?? `Operación ${r.inumoper}`;
        fila.insertCell().textContent = r.motivo;
    }
    $("tabla-fallidas").hidden = fallidas.length === 0;
    $("reintentar").hidden = fallidas.length === 0;
    $("reintentar").dataset.envio = id;

    // Las que salieron bien pasan a "Ya enviada" (desmarcadas): reenviarlas vuelve a pedir confirmación.
    const enviadas = new Set(resultados.filter((r) => r.ok).map((r) => r.inumoper));
    for (const f of facturas) if (enviadas.has(f.inumoper)) f.yaEnviada = true;
    pintarLista();
    bloquear(false);
}

$("btn-enviar").addEventListener("click", async () => {
    const elegidas = seleccionadas();
    const repetidas = facturas.filter((f) => f.yaEnviada && elegidas.includes(f.inumoper)).length;
    if (repetidas && !confirm(`${repetidas} de las facturas elegidas ya se enviaron. ¿Enviarlas otra vez?`)) return;
    bloquear(true);
    const { status, datos } = await pedir("/api/envios", { method: "POST", body: { facturas: elegidas } });
    if (status >= 300 || status === 0) {
        bloquear(false);
        return mostrarMensaje("mensaje-envio", datos.mensaje, "danger");
    }
    mostrarMensaje("mensaje-envio", "Enviando a Faktur…", "secondary");
    seguir(datos.id);
});

$("reintentar").addEventListener("click", async () => {
    $("reintentar").hidden = true;
    bloquear(true);
    const { status, datos } = await pedir(`/api/envios/${$("reintentar").dataset.envio}/reintentar`, { method: "POST" });
    if (status >= 300 || status === 0) {
        bloquear(false);
        return mostrarMensaje("mensaje-envio", datos.mensaje, "danger");
    }
    mostrarMensaje("mensaje-envio", "Reintentando las fallidas…", "secondary");
    seguir(datos.id);
});

/** Prepara la pantalla: hoy como fecha por defecto. */
export function iniciarEnvio() {
    const hoy = new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en la zona del equipo
    for (const id of ["fecha", "desde", "hasta"]) if (!$(id).value) $(id).value = hoy;
    mostrarModo();
}
