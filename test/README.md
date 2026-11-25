# Pruebas de aprobación por etapa

`npm test` ejecuta `node --test test/*.test.mjs`. No necesita red: ContaPyme y Faktur se simulan en
local (`test/simuladores/`) y el integrador se arranca como proceso real (`test/ayudas/servidor.mjs`).

## Puerta por etapa

`package.json` → `config.etapa` indica la última etapa aprobada o en curso.

- Las pruebas de etapas `<= config.etapa` son **obligatorias**: si fallan, falla la suite y el CI.
- Las de etapas posteriores se ejecutan igualmente, pero se informan como **TODO** y no rompen nada.
  Así se ve en todo momento cuánto falta.

Flujo de una etapa:

1. Crear la rama `etapa/N-nombre` desde `main`.
2. Subir `config.etapa` a `N` al empezar, para que sus pruebas pasen a ser el objetivo en rojo.
3. Implementar hasta que `npm test` quede en verde.
4. Abrir el PR a `main`. El CI (Windows, Node 22 y 24) debe pasar para hacer el merge.

Cada prueba lleva el id de la subtarea de `etapas.md` (`2.6 …`). Lo que solo se puede comprobar en
el navegador o contra los servidores reales (2.9/2.10 en la UI, 3.10, 3.11, 4.3, 4.4, 4.8, 5.8, 7.7 y
la etapa 8) queda en la checklist de `etapas.md`.

## Contrato que fijan las pruebas

### Arranque del integrador
`node <package.json main>` con estas variables de entorno:

- `PORT`: puerto de escucha, siempre en `127.0.0.1`.
- `DATOS_DIR`: carpeta del único archivo `.sqlite`, con las tablas `configuracion` y
  `factura_envios_log`.
- `LOGS_DIR`: carpeta de los logs de Winston.
- `CONTAPYME_PUERTO_LOCAL` (opcional): puerto donde se busca el agente en `127.0.0.1` cuando no hay
  configuración (por defecto 9000).

Debe responder `GET /health` → `{ ok: true }`.

### Configuración
Cuerpo: `{ ip, puerto, email, contrasena, iapp, nit, fakturUrl, fakturToken }`, con `contrasena`
en claro (el integrador la convierte a MD5 hex en minúsculas para el agente).

| Ruta | Respuesta |
|---|---|
| `GET /api/config` | `{ configurado, config }`, con `contrasena` y `fakturToken` como `"********"`. Sin configuración, `config` trae `ip` y `puerto` del agente local si lo encuentra |
| `POST /api/config/probar` | `{ ok, mensaje }`: login real y una consulta de un registro (valida el `iapp`), no guarda nada |
| `PUT /api/config` | 200 si la prueba pasa; 4xx `{ ok: false, mensaje }` sin cambios si no. Una `contrasena` o un `fakturToken` vacíos conservan el valor guardado |

### Facturas y envíos
| Ruta | Cuerpo / respuesta |
|---|---|
| `POST /api/facturas/consultar` | `{ modo: "dia", fecha: "AAAA-MM-DD" }`, `{ modo: "rango", desde, hasta }` o `{ modo: "numeros", numeros: ["FV-1001"] }` → `{ facturas: [{ inumoper, snumsop, fecha, tercero, total, yaEnviada }] }`; 400 `{ mensaje }` si no es válido |
| `POST /api/envios` | `{ facturas: ["<inumoper>"] }` → `{ id }` al instante; el envío sigue en segundo plano. 409 si alguna ya está en un envío en curso |
| `GET /api/envios/:id` | `{ id, procesadas, total, terminado, resultados: [{ inumoper, snumsop, ok, motivo }] }` |
| `POST /api/envios/:id/reintentar` | crea un envío nuevo solo con las fallidas → `{ id }`; 409 si el envío sigue en curso o ya se reintentó |

En la bitácora (`factura_envios_log`), `intento` es el número real de intentos y `created_at` va en
ISO 8601 con desfase `-05:00`.

### Estado e historial
- `GET /api/estado` → `{ configurado, contapyme: "ip:puerto", faktur: "<URL>" }`.
- `POST /api/estado/probar/contapyme` y `POST /api/estado/probar/faktur` → `{ ok, mensaje }`. La de
  Faktur hace un `OPTIONS` a la URL de operaciones con el token: no crea ni lista nada.
- `GET /logs/facturas?operation_id=&success=&page=&pageSize=` → `{ ok, page, pageSize, count, data }`,
  con `pageSize` acotado a 1–200 y `count` = total de registros que cumplen el filtro; y
  `GET /logs/facturas/:id` → `{ ok, data }`.

Todo error se devuelve como `{ ok: false, mensaje }` en lenguaje del usuario, sin `ECONNREFUSED`,
stack ni jerga de HTTP.

## Fixtures

`fixtures/contapyme/` contiene ahora mismo datos **sintéticos**, y lo indica el archivo
`PROVISIONAL`. La etapa 1 los sustituye por capturas reales anonimizadas, borra el marcador y añade
`fixtures/faktur/respuesta-{exito,error}.json`.

`test/esperados/` guarda el payload que debe recibir Faktur con esos fixtures. Cambia cuando se
confirme una regla de la etapa 6.
