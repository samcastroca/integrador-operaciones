// Utilidades compartidas por las pantallas de la interfaz.
export const $ = (id) => document.getElementById(id);

/** Petición JSON al integrador. Devuelve `{ status, datos }`; un fallo de red da status 0. */
export async function pedir(url, { method = "GET", body } = {}) {
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

/** Muestra `texto` en el elemento de alerta `id` con el color de Bootstrap `tipo`. */
export function mostrarMensaje(id, texto, tipo) {
    const m = $(id);
    m.textContent = texto;
    m.className = `alert alert-${tipo}`;
    m.hidden = false;
}
