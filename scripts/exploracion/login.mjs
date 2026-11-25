// 1.3 / 1.4 — Prueba cada variante del cuerpo de GetAuth y dice cuál acepta el agente.
// Guarda cada respuesta en capturas/login-<variante>.json.
import { VARIANTES_LOGIN, cfg, datos, encabezado, guardar, llamar } from "./agente.mjs";

console.log(`Agente: http://${cfg.ip}:${cfg.puerto}/datasnap/rest/  (controlkey ${cfg.controlkey})`);
let ganadora = null;

for (const [nombre, parametros] of Object.entries(VARIANTES_LOGIN)) {
    try {
        const r = await llamar('TBasicoGeneral/"GetAuth"/', parametros());
        guardar(`login-${nombre}`, r);
        const ok = encabezado(r).resultado === "true" && datos(r)?.keyagente;
        console.log(`${ok ? "OK  " : "FALLA"} ${nombre}: ${ok ? "keyagente recibido" : encabezado(r).mensaje || JSON.stringify(r).slice(0, 200)}`);
        if (ok && !ganadora) ganadora = nombre;
    } catch (err) {
        const detalle = err.response ? `HTTP ${err.response.status} ${JSON.stringify(err.response.data).slice(0, 200)}` : `${err.code ?? ""} ${err.message}`;
        console.log(`ERROR ${nombre}: ${detalle}`);
    }
}

console.log(ganadora ? `\nVariante que funciona: ${ganadora}  (CP_LOGIN_VARIANTE=${ganadora})` : "\nNinguna variante funcionó.");
process.exitCode = ganadora ? 0 : 1;
