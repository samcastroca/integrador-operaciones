// Etapa 6 — Reglas de negocio con Faktur. Cada regla queda como TODO con su pregunta abierta hasta
// que Faktur o el cliente la confirmen. Al confirmarla: quitar el `todo`, escribir la prueba (por lo
// general ajustando test/esperados/ y el fixture) y anotar la decisión en etapas.md.
import test from "node:test";

const reglas = {
    "6.1 método de pago": "¿catálogo de Faktur y de dónde salen los días de crédito? Hoy qdiascxc = 0 y calcularRango solapa [0,0] y [0,1]. La prueba debe comprobar que cada número de días de 0 a 210 cae en un único rango.",
    "6.2 fecha de vencimiento": "¿fcreacion o fsoport + qdiascxc? Hoy fcreacion + 0.",
    "6.3 operation_id": "¿snumsop es el código que Faktur espera (sin fecha)?",
    "6.4 mandante secundario": "tipo de documento (31 → A, resto C), nombres y apellidos, initials (hoy el nombre completo), entidad estatal y consorcio.",
    "6.5 tipo de operación y bodega": "¿solo se envía ING1? Hoy ING1 → V, resto C.",
    "6.6 productos": "impuesto (qporciva / 100), precio unitario y total.",
    "6.7 moneda": "¿siempre COP?",
};

for (const [nombre, pregunta] of Object.entries(reglas)) {
    test(nombre, { todo: `por confirmar: ${pregunta}` });
}
