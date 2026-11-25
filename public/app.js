// Interfaz del integrador: asistente y pantalla de configuración (etapa 2).
const $ = (id) => document.getElementById(id);
const form = $("form-config");
const CAMPOS = ["ip", "puerto", "email", "contrasena", "iapp", "nit", "fakturUrl", "fakturToken"];
const SECRETOS = ["contrasena", "fakturToken"];

async function pedir(url, { method = "GET", body } = {}) {
    try {
        const res = await fetch(url, {
            method,
            headers: body ? { "Content-Type": "application/json" } : {},
            body: body ? JSON.stringify(body) : undefined,
        });
        return { status: res.status, datos: await res.json() };
    } catch {
        return { status: 0, datos: { ok: false, mensaje: "No se pudo comunicar con el integrador. ¿Sigue abierto?" } };
    }
}

function mostrarMensaje(texto, tipo) {
    const m = $("mensaje");
    m.textContent = texto;
    m.className = `alert alert-${tipo}`;
    m.hidden = false;
}

function leerFormulario() {
    return Object.fromEntries(CAMPOS.map((c) => [c, form.elements[c].value.trim()]));
}

function rellenar(config, configurado) {
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
    $("configuracion").hidden = false;

    if (datos.configurado) {
        $("menu").hidden = false;
        $("titulo").textContent = "Configuración";
        $("ayuda").textContent = "Cambia los datos de conexión. Deja la contraseña y el token vacíos para conservar los guardados.";
    } else {
        $("titulo").textContent = "Configuración inicial";
        $("ayuda").textContent = datos.detectado
            ? "Se encontró ContaPyme en este equipo. Completa los datos y prueba la conexión."
            : "Escribe los datos de conexión de ContaPyme y de Faktur, y prueba la conexión.";
    }
    rellenar(datos.config, datos.configurado);
}

// Cualquier cambio invalida la prueba anterior.
form.addEventListener("input", () => {
    $("guardar").disabled = true;
});

$("probar").addEventListener("click", async () => {
    $("probar").disabled = true;
    mostrarMensaje("Probando la conexión…", "secondary");
    const { datos } = await pedir("/api/config/probar", { method: "POST", body: leerFormulario() });
    $("probar").disabled = false;
    mostrarMensaje(datos.mensaje, datos.ok ? "success" : "danger");
    $("guardar").disabled = !datos.ok;
});

form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    $("guardar").disabled = true;
    const { datos } = await pedir("/api/config", { method: "PUT", body: leerFormulario() });
    if (!datos.ok) return mostrarMensaje(datos.mensaje, "danger");
    await iniciar();
    mostrarMensaje(datos.mensaje, "success");
});

iniciar();
