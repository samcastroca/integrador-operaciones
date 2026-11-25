// 1.5–1.7 — Captura en capturas/ las respuestas reales de las consultas que usa el integrador:
// lista de operaciones (con paginación), detalle de una factura y terceros natural y jurídico.
// Solo lectura: GetListaOperaciones, DoExecuteOprAction con accion "LOAD" y GetInfoTercero.
import { datos, encabezado, guardar, llamar, login } from "./agente.mjs";

// Opcional: sin fecha se piden las facturas más recientes (ordenadas por fsoport desc).
const fecha = process.env.CP_FECHA_PRUEBA || "";
if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error("CP_FECHA_PRUEBA debe ser AAAA-MM-DD o quedar vacía");
const iapp = process.env.CP_IAPP;
const POR_PAGINA = Number(process.env.CP_POR_PAGINA || 5); // pequeño para que haya varias páginas

const keyagente = await login();
console.log("Login correcto.");

// Mismo cuerpo que obtenerFacturasPorPlazo (api.mjs), filtrando por el día de prueba.
const lista = (pagina) =>
    llamar('TCatOperaciones/"GetListaOperaciones"/', [
        {
            datospagina: { cantidadregistros: String(POR_PAGINA), pagina: String(pagina) },
            camposderetorno: ["itdoper", "fcreacion", "inumoper", "tdetalle", "ncorto", "iestado", "ntdsop", "ntercero",
                "iprocess", "fsoport", "snumsop", "qerror", "qwarning", "banulada", "mingresos", "megresos", "mtotaloperacion"],
            ordenarpor: { fsoport: "desc" },
            datosfiltro: { banulada: "F", itdoper: "ING1", ...(fecha && { sql: `OprMaest.fcreacion like '%${fecha}%'` }) },
        },
        keyagente, iapp, "0",
    ]);

const p1 = await lista(1);
guardar("lista-operaciones-p1", p1);
const pag = p1?.result?.[0]?.respuesta?.paginacion;
console.log(`Lista: ${encabezado(p1).resultado} ${encabezado(p1).mensaje ?? ""} · paginación ${JSON.stringify(pag)}`);
const operaciones = [...(datos(p1) ?? [])];
if (!operaciones.length) throw new Error(`Sin facturas ING1 ${fecha ? `el ${fecha}` : 'recientes'}`);
if (Number(pag?.totalpaginas) > 1) {
    const p2 = await lista(2);
    guardar("lista-operaciones-p2", p2);
    operaciones.push(...(datos(p2) ?? []));
    console.log(`Página 2: ${datos(p2)?.length ?? 0} operaciones`);
}

const detalle = (op) =>
    llamar('TCatOperaciones/"DoExecuteOprAction"/', [
        { accion: "LOAD", operaciones: [{ inumoper: op.inumoper, itdoper: op.itdoper }] },
        keyagente, iapp, "0",
    ]);
const tercero = (init) => llamar('TCatTerceros/"GetInfoTercero"/', [{ init }, keyagente, iapp]);

// Recorre facturas hasta tener un comprador natural (bempresa != "T") y uno jurídico ("T"). Las
// páginas siguientes se piden solo si hace falta, hasta CP_MAX_PAGINAS; en cada página van primero las
// filas cuyo tercero parece una empresa (SAS, LTDA…), que suelen ser las jurídicas.
const MAX_PAGINAS = Number(process.env.CP_MAX_PAGINAS || 3);
const pareceEmpresa = (op) => /(S.?s?A.?s?S|LTDA|S.?s?A|SAS|E.?U).?/i.test(op.ntercero ?? "");
const buscados = { natural: null, juridica: null };
const vistos = new Set();
let primerDetalle = false;
let pagina = Math.min(2, Number(pag?.totalpaginas) || 1);
let cola = [...operaciones];
while (!(buscados.natural && buscados.juridica)) {
    cola.sort((a, b) => pareceEmpresa(b) - pareceEmpresa(a));
    for (const op of cola) {
        if (buscados.natural && buscados.juridica) break;
        if (buscados.natural && !pareceEmpresa(op) && primerDetalle) continue; // solo falta la jurídica
        const d = await detalle(op);
        if (!primerDetalle) {
            guardar("detalle-factura", d);
            primerDetalle = true;
            const dd = datos(d);
            console.log(`Detalle ${op.snumsop}: claves ${Object.keys(dd ?? {}).join(", ")} · formacobro ${dd?.formacobro ? "sí" : "NO"}`);
        }
        const init = datos(d)?.datosprincipales?.init;
        if (!init || vistos.has(init)) continue;
        vistos.add(init);
        const t = await tercero(init);
        const tipo = datos(t)?.infobasica?.bempresa === "T" ? "juridica" : "natural";
        if (!buscados[tipo]) {
            buscados[tipo] = op.snumsop;
            guardar(`tercero-${tipo}`, t);
            guardar(`detalle-factura-${tipo}`, d);
            console.log(`Tercero ${tipo}: comprador de ${op.snumsop} (página ${pagina})`);
        }
    }
    if (buscados.natural && buscados.juridica) break;
    if (++pagina > Math.min(MAX_PAGINAS, Number(pag?.totalpaginas) || 1)) break;
    cola = datos(await lista(pagina)) ?? [];
}

// Respaldo: en este ContaPyme casi todos los compradores son personas naturales. Si las facturas
// recorridas no traen un jurídico, se toma uno con NIT (itddocum 31) de GetListaTerceros.
if (!buscados.juridica) {
    const r = await llamar('TCatTerceros/"GetListaTerceros"/', [
        { datospagina: { cantidadregistros: "50", pagina: "1" }, camposderetorno: ["init", "bempresa", "itddocum"], datosfiltro: { bempresa: "T" } },
        keyagente, iapp, "0",
    ]);
    const candidato = (datos(r) ?? []).find((t) => t.itddocum === "31") ?? datos(r)?.[0];
    if (candidato) {
        guardar("tercero-juridica", await tercero(candidato.init));
        buscados.juridica = "GetListaTerceros";
        console.log(`Tercero juridica: tomado de GetListaTerceros (itddocum ${candidato.itddocum})`);
    }
}

if (process.env.CP_NIT) guardar("tercero-emisor", await tercero(process.env.CP_NIT));

for (const [tipo, factura] of Object.entries(buscados)) {
    if (!factura) console.log(`AVISO: ninguna factura capturada tiene comprador ${tipo}; sube CP_MAX_PAGINAS o prueba con CP_FECHA_PRUEBA.`);
}
console.log("Capturas en capturas/ (sin anonimizar, no se suben).");
