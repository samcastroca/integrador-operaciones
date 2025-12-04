// logger.mjs
import fs from "node:fs";
import path from "node:path";
import winston from "winston";
import "winston-daily-rotate-file";

const defaultDir = path.resolve("logs");
const logsDir = path.resolve(process.env.LOGS_DIR || defaultDir);

// Asegura que exista el directorio de logs
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const level = process.env.LOG_LEVEL || "info";

const rotateTransport = new winston.transports.DailyRotateFile({
    dirname: logsDir,
    filename: "app-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "14d",
});

const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp, ...meta }) =>
        `${timestamp} [${level}] ${message}${Object.keys(meta).length ? " " + JSON.stringify(meta) : ""
        }`
    )
);

const fileFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ level, message, timestamp, ...meta }) =>
        `${timestamp} [${level}] ${message}${Object.keys(meta).length ? " " + JSON.stringify(meta) : ""
        }`
    )
);

const logger = winston.createLogger({
    level,
    format: fileFormat,
    transports: [
        new winston.transports.Console({ format: consoleFormat }),
        rotateTransport,
    ],
    exceptionHandlers: [rotateTransport],
    rejectionHandlers: [rotateTransport],
});

export default logger;
export { logsDir };
