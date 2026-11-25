// filtro.mjs — filtro SQL de GetListaOperaciones a partir de una consulta validada (subtarea 3.1).
// El agente recibe el filtro como texto SQL: solo se construye con valores que pasan la validación.
import moment from "moment-timezone";

/** Error con un mensaje apto para mostrar al usuario (se responde con 400). */
export class ErrorFiltro extends Error { }

const MAX_NUMEROS = 200;
const NUMERO = /^[A-Za-z0-9-]{1,30}$/;

function fecha(valor, nombre) {
    if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || !moment(valor, "YYYY-MM-DD", true).isValid()) {
        throw new ErrorFiltro(`${nombre} no es una fecha válida (AAAA-MM-DD).`);
    }
    return valor;
}

/**
 * `{ modo: "dia", fecha }`, `{ modo: "rango", desde, hasta }` o `{ modo: "numeros", numeros: [...] }`
 * → condición SQL sobre la fecha de la factura (`fsoport`, sin hora) o su número (`snumsop`).
 * @returns {string}
 */
export function construirFiltro(consulta = {}) {
    switch (consulta?.modo) {
        case "dia":
            return `OprMaest.fsoport = '${fecha(consulta.fecha, "La fecha")}'`;
        case "rango": {
            const desde = fecha(consulta.desde, "La fecha inicial");
            const hasta = fecha(consulta.hasta, "La fecha final");
            if (desde > hasta) throw new ErrorFiltro("La fecha inicial es posterior a la final.");
            return `OprMaest.fsoport between '${desde}' and '${hasta}'`;
        }
        case "numeros": {
            const lista = consulta.numeros;
            if (!Array.isArray(lista) || lista.length === 0) throw new ErrorFiltro("Escribe al menos un número de factura.");
            if (lista.length > MAX_NUMEROS) throw new ErrorFiltro(`Se pueden consultar hasta ${MAX_NUMEROS} números a la vez.`);
            const numeros = [...new Set(lista.map((n) => (typeof n === "string" ? n.trim() : "")))];
            const malo = numeros.find((n) => !NUMERO.test(n));
            if (malo !== undefined) throw new ErrorFiltro(`"${malo}" no es un número de factura válido (solo letras, números y guiones).`);
            return `(${numeros.map((n) => `OprMaest.snumsop = '${n}'`).join(" OR ")})`;
        }
        default:
            throw new ErrorFiltro("Elige cómo consultar: por día, por rango de fechas o por números de factura.");
    }
}
