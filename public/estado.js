// Pantalla "Estado de la conexión" (subtarea 4.6): destinos y un botón de prueba para cada uno.
import { $, mostrarMensaje, pedir } from "./comun.js";

async function probar(destino) {
    const boton = $(`probar-${destino}`);
    boton.disabled = true;
    mostrarMensaje(`mensaje-${destino}`, "Probando…", "secondary");
    const { datos } = await pedir(`/api/estado/probar/${destino}`, { method: "POST" });
    boton.disabled = false;
    mostrarMensaje(`mensaje-${destino}`, datos.mensaje, datos.ok ? "success" : "danger");
}

$("probar-contapyme").addEventListener("click", () => probar("contapyme"));
$("probar-faktur").addEventListener("click", () => probar("faktur"));

/** Al entrar a la pantalla: muestra a qué ContaPyme y a qué Faktur apunta la configuración. */
export async function iniciarEstado() {
    $("mensaje-contapyme").hidden = true;
    $("mensaje-faktur").hidden = true;
    const { datos } = await pedir("/api/estado");
    $("destino-contapyme").textContent = datos.contapyme ?? "Sin configurar";
    $("destino-faktur").textContent = datos.faktur ?? "Sin configurar";
}
