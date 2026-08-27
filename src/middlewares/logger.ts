import { pinoHttp } from "pino-http";
import type { IncomingMessage, ServerResponse } from "http";
import logger from "../utils/logger.js";

const requestLogger = pinoHttp({
  logger,
  autoLogging: true,
  customLogLevel: (_req: IncomingMessage, res: ServerResponse) => {
    if (res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  customSuccessMessage: (req: IncomingMessage, res: ServerResponse) =>
    `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req: IncomingMessage, res: ServerResponse) =>
    `${req.method} ${req.url} ${res.statusCode} - Request failed`,
  serializers: {
    req(req: any) {
      return {
        method: req.method,
        url: req.url,
        requestId: req.id,
      };
    },
  },
});

export default requestLogger;