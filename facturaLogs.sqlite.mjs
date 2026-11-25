// facturaLogs.sqlite.mjs
import moment from "moment-timezone";
import { db } from "./datos.mjs";

// Creamos la tabla si no existe
db.exec(`
  CREATE TABLE IF NOT EXISTS factura_envios_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id   TEXT NOT NULL,
    success        INTEGER NOT NULL,      -- 1 = OK, 0 = ERROR
    http_status    INTEGER,
    intento        INTEGER,
    request_body   TEXT,                  -- JSON stringify
    response_body  TEXT,                  -- JSON stringify
    error_message  TEXT,
    created_at     TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_factura_envios_log_operation_id
    ON factura_envios_log(operation_id);

  CREATE INDEX IF NOT EXISTS idx_factura_envios_log_success
    ON factura_envios_log(success);

  CREATE INDEX IF NOT EXISTS idx_factura_envios_log_created_at
    ON factura_envios_log(created_at);
`);

// Statement preparado para inserts
const insertStmt = db.prepare(`
  INSERT INTO factura_envios_log (
    operation_id,
    success,
    http_status,
    intento,
    request_body,
    response_body,
    error_message,
    created_at
  ) VALUES (
    @operation_id,
    @success,
    @http_status,
    @intento,
    @request_body,
    @response_body,
    @error_message,
    @created_at
  );
`);

export function guardarLogFactura({
    operationId,
    success,
    httpStatus,
    intento = 1,
    requestBody,
    responseBody,
    errorMessage,
}) {
    insertStmt.run({
        operation_id: operationId ?? "",
        success: success ? 1 : 0,
        http_status: httpStatus ?? null,
        intento,
        request_body: requestBody ? JSON.stringify(requestBody) : null,
        response_body: responseBody ? JSON.stringify(responseBody) : null,
        error_message: errorMessage ?? null,
        created_at: moment().tz("America/Bogota").format(), // ISO 8601 con -05:00
    });
}

/** De los `operationIds` dados, los que tienen un envío correcto en la bitácora. */
export function yaEnviadas(operationIds) {
    const filas = yaEnviadasStmt.all(JSON.stringify(operationIds));
    return new Set(filas.map((f) => f.operation_id));
}
const yaEnviadasStmt = db.prepare(`
  SELECT DISTINCT operation_id FROM factura_envios_log
  WHERE success = 1 AND operation_id IN (SELECT value FROM json_each(?))
`);

// Para consultas desde las rutas
export function listarLogs({
    operationId,
    success,       // 0 o 1 (opcional)
    page = 1,
    pageSize = 50,
} = {}) {
    const where = [];
    const params = [];

    if (operationId) {
        where.push("operation_id = ?");
        params.push(operationId);
    }

    if (success === 0 || success === 1) {
        where.push("success = ?");
        params.push(success);
    }

    const offset = (page - 1) * pageSize;

    const sql = `
    SELECT *
    FROM factura_envios_log
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

    const stmt = db.prepare(sql);
    return stmt.all(...params, pageSize, offset);
}

export function obtenerLogPorId(id) {
    const stmt = db.prepare(`SELECT * FROM factura_envios_log WHERE id = ?`);
    return stmt.get(id);
}
