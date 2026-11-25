// Interfaz del integrador: navegación, asistente y pantalla de configuración.
import { $, mostrarMensaje, pedir } from "./comun.js";
import { iniciarEnvio } from "./enviar.js";

const form = $("form-config");
const CAMPOS = ["ip", "puerto", "email", "contrasena", "iapp", "nit", "fakturUrl", "fakturToken"];
const SECRETOS = ["contrasena", "fakturToken"];
const PANTALLAS = ["enviar", "configuracion"];
let configurado = false;

/** Muestra la pantalla del hash; sin configuración, toda ruta lleva al asistente. */
function navegar() {
    const pedida = location.hash.slice(1);
    const pantalla = !configurado ? "configuracion" : PANTALLAS.includes(pedida) ? pedida : "enviar";
    for (const p of PANTALLAS) $(p).hidden = p !== pantalla;
    for (const a of document.querySelectorAll("#menu .nav-link")) {
        a.classList.toggle("active", a.getAttribute("href") === `#${pantalla}`);
    }
    if (pantalla === "enviar") iniciarEnvio();
}

function leerFormulario() {
    return Object.fromEntries(CAMPOS.map((c) => [c, form.elements[c].value.trim()]));
}

function rellenar(config) {
    for (const c of CAMPOS) {
        const input = form.elements[c];
        if (SECRETOS.includes(c)) {
            input.value = "";
            input.placeholder = configurado ? "Sin cambios (guardada)" : "";
            input.required = !configurado;
        } else {
            input.value = config?.[c] ?? "";
        }
    }
}

async function iniciar() {
    const { datos } = await pedir("/api/config");
    $("cargando").hidden = true;
    configurado = !!datos.configurado;

    if (configurado) {
        $("menu").hidden = false;
        $("titulo").textContent = "Configuración";
        $("ayuda").textContent = "Cambia los datos de conexión. Deja la contraseña y el token vacíos para conservar los guardados.";
    } else {
        $("titulo").textContent = "Configuración inicial";
        $("ayuda").textContent = datos.detectado
            ? "Se encontró ContaPyme en este equipo. Completa los datos y prueba la conexión."
            : "Escribe los datos de conexión de ContaPyme y de Faktur, y prueba la conexión.";
    }
    rellenar(datos.config);
    navegar();
}

window.addEventListener("hashchange", navegar);

// Cualquier cambio invalida la prueba anterior.
form.addEventListener("input", () => {
    $("guardar").disabled = true;
});

$("probar").addEventListener("click", async () => {
    $("probar").disabled = true;
    mostrarMensaje("mensaje", "Probando la conexión…", "secondary");
    const { datos } = await pedir("/api/config/probar", { method: "POST", body: leerFormulario() });
    $("probar").disabled = false;
    mostrarMensaje("mensaje", datos.mensaje, datos.ok ? "success" : "danger");
    $("guardar").disabled = !datos.ok;
});

form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    $("guardar").disabled = true;
    const { datos } = await pedir("/api/config", { method: "PUT", body: leerFormulario() });
    if (!datos.ok) return mostrarMensaje("mensaje", datos.mensaje, "danger");
    await iniciar();
    mostrarMensaje("mensaje", datos.mensaje, "success");
});

iniciar();
