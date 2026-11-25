# Scripts de exploración (etapa 1)

Capturan respuestas reales del agente ContaPyme y de Faktur de pruebas para fijar formatos y alimentar
los simuladores de `test/simuladores/`. Contra ContaPyme solo hacen lecturas: `GetAuth`,
`GetListaOperaciones`, `DoExecuteOprAction` con `accion: "LOAD"` y `GetInfoTercero`.

Las respuestas en bruto van a `capturas/`, que git ignora porque tienen datos reales. A `fixtures/`
solo llega lo anonimizado.

## Variables en `.env`

| Variable | Qué es |
|---|---|
| `CP_IP`, `CP_PUERTO` | Dónde escucha el agente ContaPyme |
| `CP_EMAIL`, `CP_CONTRASENA` | Usuario de pruebas; la contraseña va en claro y el script calcula el MD5 |
| `CP_IAPP` | Identificador de la aplicación |
| `CP_CONTROLKEY` | Opcional. Por defecto `1D740FDE63` |
| `CP_NIT` | NIT de la empresa emisora |
| `CP_FECHA_PRUEBA` | Opcional: un día con facturas `ING1` (`AAAA-MM-DD`). Vacía = las más recientes |
| `CP_LOGIN_VARIANTE` | La variante que da por buena `login.mjs`. Por defecto `string-md5` |
| `FAKTUR_TOKEN`, `FAKTUR_URL` | Token de pruebas. La URL por defecto es `https://develop.faktur.co/api/operations/` |

## Orden

```bash
node --env-file=.env scripts/exploracion/login.mjs       # 1.3–1.4: qué cuerpo de GetAuth acepta el agente
node --env-file=.env scripts/exploracion/capturar.mjs    # 1.5–1.7: lista, detalle y terceros → capturas/
node --env-file=.env scripts/exploracion/anonimizar.mjs  # 1.8: capturas/ → fixtures/contapyme/
node --env-file=.env scripts/exploracion/faktur.mjs      # 1.9: una operación válida y una inválida → fixtures/faktur/
```
