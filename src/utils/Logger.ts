import winston, { Logger } from "winston";
import { LoggerConfig } from "../types/index.js";

const defaultConfig: LoggerConfig = {
    level: "info",
    format: "%(levelname)s - %(message)s",
};

export function createLogger(
    name: string,
    config: LoggerConfig = defaultConfig
): Logger {
    return winston.createLogger({
        level: config.level,
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.label({ label: name }),
            winston.format.printf(({ timestamp, label, level, message }) => {
                return `${timestamp} [${label}] ${level.toUpperCase()}: ${message}`;
            })
        ),
        transports: [
            new winston.transports.Console(),
            ...(config.filename
                ? [new winston.transports.File({ filename: config.filename })]
                : []),
        ],
    });
}
