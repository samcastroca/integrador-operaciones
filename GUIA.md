# Guía de uso del Integrador Faktur

El integrador toma las facturas de ContaPyme y las envía a Faktur. Funciona en este mismo equipo y se
maneja desde el navegador.

## Antes de instalar

- Windows 10 u 11, en el mismo equipo donde corre ContaPyme.
- Conexión a internet: la necesitan la instalación y los envíos a Faktur.
- No hace falta instalar nada antes: si el equipo no tiene Node.js 22 o 24, el instalador lo descarga
  de nodejs.org dentro de la carpeta del integrador, sin permisos de administrador.
- Los datos que pide la configuración: email y contraseña del usuario de ContaPyme, código de la
  aplicación (`iapp`), NIT de la empresa y token de Faktur.

## Instalación (una sola vez)

1. Copia la carpeta del integrador a `C:\IntegradorFaktur`. Evita el escritorio y las carpetas de
   OneDrive: ahí se guardan también los datos.
2. Abre esa carpeta, haz clic en la barra de direcciones, escribe `powershell` y pulsa Enter.
3. En la ventana azul, escribe y pulsa Enter:

   ```
   powershell -ExecutionPolicy Bypass -File instalar.ps1
   ```

4. Cuando diga **"Listo"**, tendrás en el escritorio el acceso directo **Integrador Faktur**.

### Opcional: dejarlo siempre encendido (servicio de Windows)

Si prefieres que el integrador arranque solo con el equipo, sin ventana negra, instálalo como servicio.
En la misma ventana azul, dentro de `C:\IntegradorFaktur`:

```
powershell -ExecutionPolicy Bypass -File servicio.ps1
```

Windows pedirá permiso de administrador. Desde entonces, el acceso directo **Integrador Faktur** solo
abre el navegador. Para volver al modo normal:

```
powershell -ExecutionPolicy Bypass -File servicio.ps1 -Quitar
```

## Primera vez: configuración

1. Abre el acceso directo **Integrador Faktur**. Se abre una ventana negra y, después, el navegador.
2. El integrador pide la configuración. Si encuentra ContaPyme en este equipo, rellena solo la IP y el
   puerto.
3. Completa email, contraseña, `iapp`, NIT, URL y token de Faktur, y pulsa **Probar conexión**.
4. Si la prueba pasa, pulsa **Guardar**. Si falla, el mensaje dice qué revisar.

## Uso diario

1. Doble clic en **Integrador Faktur**.
2. Elige qué facturas quieres (de un día, de un rango de fechas o por número) y pulsa **Consultar**.
3. En la lista, las **ya enviadas** aparecen marcadas. Elige cuáles enviar y pulsa **Enviar a Faktur**.
4. Mira el progreso. Al final verás cuáles llegaron bien y cuáles fallaron y por qué; puedes
   **Reintentar las fallidas**.
5. Mientras lo usas, **deja abierta la ventana negra** (puedes minimizarla). Al cerrarla, el integrador
   se apaga. Si lo instalaste como servicio, no hay ventana negra: sigue encendido.

En **Historial** ves todos los envíos anteriores, y en **Estado de la conexión** puedes comprobar
ContaPyme y Faktur.

## Copia de seguridad

Toda la información (configuración e historial de envíos) está en la carpeta
`C:\IntegradorFaktur\datos`.

1. Cierra la ventana negra del integrador. Si está como servicio: tecla Windows → escribe `Servicios` →
   busca **Integrador Faktur** → **Detener**. Al terminar la copia, **Iniciar**.
2. Copia la carpeta `datos` completa a un lugar seguro (un disco externo o una carpeta en la nube).

Para restaurar, cierra el integrador y vuelve a poner esa carpeta en `C:\IntegradorFaktur`.
**No borres `C:\IntegradorFaktur` al reinstalar** sin haber copiado antes la carpeta `datos`.

## Si algo no funciona

| Qué pasa | Qué hacer |
|---|---|
| El instalador dice que no pudo instalar Node.js o que `npm ci` falló | Revisa la conexión a internet y repítelo. |
| El acceso directo no abre el navegador | Abre http://localhost:4000 a mano. Si no carga, cierra la ventana negra y vuelve a abrir el acceso directo. |
| Un envío falla | El motivo aparece en la tabla de fallidas y en **Historial** → **Ver**. Corrige el dato en ContaPyme si hace falta y pulsa **Reintentar las fallidas**. |
| ContaPyme o Faktur no responden | En **Estado de la conexión**, prueba cada uno; si cambió algo (IP, contraseña, token), corrígelo en **Configuración**. |
