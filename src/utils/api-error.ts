export class ApiError extends Error {
  statusCode: number;
  code: string;
  isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    code: string = "INTERNAL_ERROR",
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.name = "ApiError";

    Error.captureStackTrace(this, this.constructor);
  }
}
