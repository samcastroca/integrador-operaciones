# Guía de uso del Integrador Faktur

El integrador toma las facturas de ContaPyme y las envía a Faktur. Funciona en este mismo equipo y se
maneja desde el navegador.

## Antes de instalar

- Windows 10 u 11, en el mismo equipo donde corre ContaPyme.
- **Node.js 22 o 24 (LTS)**, descargado de https://nodejs.org (instalador de Windows, opciones por
  defecto).
- Conexión a internet: la necesitan la instalación y los envíos a Faktur.
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
   se apaga.

En **Historial** ves todos los envíos anteriores, y en **Estado de la conexión** puedes comprobar
ContaPyme y Faktur.

## Copia de seguridad

Toda la información (configuración e historial de envíos) está en la carpeta
`C:\IntegradorFaktur\datos`.

1. Cierra la ventana negra del integrador.
2. Copia la carpeta `datos` completa a un lugar seguro (un disco externo o una carpeta en la nube).

Para restaurar, cierra el integrador y vuelve a poner esa carpeta en `C:\IntegradorFaktur`.
**No borres `C:\IntegradorFaktur` al reinstalar** sin haber copiado antes la carpeta `datos`.

## Si algo no funciona

| Qué pasa | Qué hacer |
|---|---|
| El instalador dice que no encuentra Node.js | Instala Node.js 22 o 24 desde https://nodejs.org, cierra la ventana azul y repite la instalación. |
| El instalador dice que `npm ci` falló | Revisa la conexión a internet y repítelo. |
| El acceso directo no abre el navegador | Abre http://localhost:4000 a mano. Si no carga, cierra la ventana negra y vuelve a abrir el acceso directo. |
| Un envío falla | El motivo aparece en la tabla de fallidas y en **Historial** → **Ver**. Corrige el dato en ContaPyme si hace falta y pulsa **Reintentar las fallidas**. |
| ContaPyme o Faktur no responden | En **Estado de la conexión**, prueba cada uno; si cambió algo (IP, contraseña, token), corrígelo en **Configuración**. |
