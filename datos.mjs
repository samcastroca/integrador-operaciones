// datos.mjs — la única base SQLite del integrador (configuración y bitácora de envíos).
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export const datosDir = path.resolve(process.env.DATOS_DIR || "datos");
fs.mkdirSync(datosDir, { recursive: true });

export const db = new Database(path.join(datosDir, "integrador.sqlite"));
db.pragma("journal_mode = WAL");
