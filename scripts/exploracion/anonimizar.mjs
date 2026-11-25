// 1.8 — De capturas/ (datos reales) a fixtures/contapyme/ (anonimizados).
// Regla: TODO valor de texto se revuelve salvo que su clave sea un código, una bandera, una cantidad o
// una fecha. Revolver conserva longitud y formato (dígito→dígito, letra→letra, resto igual) y es
// determinista por valor, así el mismo documento queda igual en todos los archivos. Los montos (m*) se
// escalan para no exponer valores reales. Al final se comprueba que ningún valor original sobrevive.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const capturas = new URL("../../capturas/", import.meta.url);
const destino = new URL("../../fixtures/contapyme/", import.meta.url);

const ARCHIVOS = {
    "lista-operaciones": "lista-operaciones-p1",
    "detalle-factura": "detalle-factura",
    "tercero-natural": "tercero-natural",
    "tercero-juridica": "tercero-juridica",
};

// Claves cuyo valor no es personal aunque no sigan las reglas por prefijo.
const SEGURAS = new Set([
    "ncorto", "ntdsop", "nrecurso", "nunidad", "npais", "ndep", "nmun", "ndocumento", "isexo",
    "sclasiflegal", "sclasifliquid", "sresponsabilidades", "calc_ipaisidep", "calc_ipaisidepimun",
    "calc_itdtercero", "totalpaginas", "totalregistros", "pagina", "resultado", "mensaje", "imensaje", "tiempo", "version", "itdoper",
]);
// Claves con prefijo "seguro" (i*, f*) que sí son personales.
const SENSIBLES = new Set(["inumsop", "iusuario", "iusuarioult", "iws", "iwsult", "ictanumero", "ictanumero2", "ictanombre", "ictanombre2", "idigchequeo", "fnacimiento"]);
// Claves que se vacían: no las usa el integrador y solo aportan volumen y datos personales.
const VACIAR = new Set(["empdocumentoelectronico"]);

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const FACTOR_MONTOS = 0.8;
const revueltos = new Set(); // valores originales sustituidos, para la comprobación final

function revolver(valor, { soloDigitos = false, conservarPrimero = false } = {}) {
    const h = createHash("sha256").update(valor).digest();
    let i = 0;
    const azar = () => h[i++ % h.length] + i;
    return [...valor].map((c, pos) => {
        if (conservarPrimero && pos === 0) return c;
        if (/\d/.test(c)) return String(azar() % 10);
        if (soloDigitos) return c;
        if (/\p{L}/u.test(c)) {
            const l = LETRAS[azar() % 26];
            return c === c.toLowerCase() && c !== c.toUpperCase() ? l.toLowerCase() : l;
        }
        return c;
    }).join("");
}

function anonimizarValor(clave, v) {
    if (v === "" || /^[TF]$/.test(v)) return v;
    if (VACIAR.has(clave)) return v;
    if (clave === "fnacimiento") return "01/01/1980";
    const sensible = SENSIBLES.has(clave) || clave.startsWith("init");
    if (!sensible) {
        if (SEGURAS.has(clave)) return v;
        if (/^(i|q|b|f)/.test(clave)) return v; // códigos, cantidades/porcentajes, banderas y fechas
        if (/^m/.test(clave) && /^-?\d+(\.\d+)?$/.test(v)) {
            const decimales = v.split(".")[1]?.length ?? 0;
            return (Number(v) * FACTOR_MONTOS).toFixed(decimales);
        }
    }
    const nuevo = revolver(v, { soloDigitos: clave === "snumsop" || clave === "inumsop", conservarPrimero: /^init/.test(clave) });
    if (nuevo !== v && v.length >= 4) revueltos.add(v);
    return nuevo;
}

function recorrer(nodo, clave = "") {
    if (VACIAR.has(clave)) return Array.isArray(nodo) ? [] : {};
    if (Array.isArray(nodo)) return nodo.map((x) => recorrer(x, clave));
    if (nodo && typeof nodo === "object") {
        return Object.fromEntries(Object.entries(nodo).map(([k, x]) => [k, recorrer(x, k)]));
    }
    return typeof nodo === "string" ? anonimizarValor(clave, nodo) : nodo;
}

const salidas = {};
for (const [fixture, captura] of Object.entries(ARCHIVOS)) {
    const original = JSON.parse(readFileSync(new URL(`${captura}.json`, capturas), "utf8"));
    salidas[fixture] = JSON.stringify(recorrer(original), null, 2) + "\n";
}

// Comprobación: ningún valor original revuelto aparece en ninguna salida.
const fugas = [];
for (const [fixture, texto] of Object.entries(salidas)) {
    for (const v of revueltos) if (texto.includes(JSON.stringify(v).slice(1, -1))) fugas.push(`${fixture}: un valor de ${v.length} caracteres`);
}
if (fugas.length) {
    console.error(`Anonimización incompleta, no se escribe nada:\n${fugas.join("\n")}`);
    process.exit(1);
}

for (const [fixture, texto] of Object.entries(salidas)) writeFileSync(new URL(`${fixture}.json`, destino), texto);
console.log(`Escritos ${Object.keys(salidas).length} fixtures en fixtures/contapyme/ · ${revueltos.size} valores sustituidos, sin fugas.`);
