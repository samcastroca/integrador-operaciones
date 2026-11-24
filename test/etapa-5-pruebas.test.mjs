// Etapa 5 — Pruebas. 5.1 y 5.2 (simuladores) se adelantaron a la etapa 0; 5.4–5.6 las cubren las
// pruebas de las etapas 2 y 3. Aquí queda 5.3: el payload que recibe Faktur, campo por campo.
//
// Los esperados (test/esperados/) reflejan las reglas ACTUALES de api.mjs con los fixtures sintéticos.
// Las reglas aún por confirmar (etapa 6: método de pago, vencimiento, nombres…) los cambiarán:
// actualízalos a la vez que la regla y anótalo en etapas.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { etapa } from "./ayudas/etapa.mjs";
import { enviarYEsperar, montarEscenario } from "./ayudas/escenario.mjs";

const E = etapa(5);
const esperado = (f) => JSON.parse(readFileSync(new URL(`./esperados/${f}`, import.meta.url), "utf8"));

for (const [tipo, compradorJuridico] of [["natural", false], ["juridica", true]]) {
    test(`5.3 payload a Faktur con comprador ${tipo}`, E, async () => {
        const e = await montarEscenario({ contapyme: { facturas: 1, compradorJuridico } });
        try {
            await enviarYEsperar(e.url, ["1001"]);
            assert.equal(e.fk.recibidas.length, 1);
            assert.deepStrictEqual(e.fk.recibidas[0].cuerpo, esperado(`payload-${tipo}.json`));
        } finally {
            await e.parar();
        }
    });
}
