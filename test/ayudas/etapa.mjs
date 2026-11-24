// Puerta por etapa: las pruebas de etapas posteriores a `config.etapa` (package.json) se ejecutan,
// pero se informan como TODO y no rompen la suite. Al aprobar una etapa se sube `config.etapa`.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const raiz = fileURLToPath(new URL("../../", import.meta.url));

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

export const etapaActual = Number(pkg.config?.etapa ?? 0);
export const entrada = pkg.main;

/** Opciones de `test()` para una prueba de la etapa `n`. */
export function etapa(n) {
    return n > etapaActual ? { todo: `etapa ${n} pendiente (config.etapa = ${etapaActual})` } : {};
}
