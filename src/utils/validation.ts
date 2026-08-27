import { z } from "zod";
import type { ZodTypeAny } from "zod";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import type { Request, Response, NextFunction, RequestHandler } from "express";

// ---------------------------------------------
// DOMPurify setup (Node-safe)
// ---------------------------------------------
const window = new JSDOM("").window;
const purify = createDOMPurify(window);

// ---------------------------------------------
// Recursive sanitizer (fully typed)
// ---------------------------------------------
type Sanitizable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Sanitizable[]
  | { [key: string]: Sanitizable };

const recursiveSanitize = (input: Sanitizable): Sanitizable => {
  if (Array.isArray(input)) {
    return input.map(recursiveSanitize);
  }

  if (typeof input === "object" && input !== null) {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [
        key,
        recursiveSanitize(value as Sanitizable),
      ])
    );
  }

  if (typeof input === "string") {
    return purify.sanitize(input);
  }

  return input;
};

// ---------------------------------------------
// Validation Middleware Factory
// ---------------------------------------------
type RequestSource = "body" | "query" | "params";

export function validationInput(
  schema: ZodTypeAny,
  source: RequestSource = "body",
  sanitize = true
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req[source]);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Invalid input",
          errors: result.error.flatten().fieldErrors,
        });
      }

      const validatedData = sanitize
        ? (recursiveSanitize(result.data as Sanitizable) as any)
        : result.data;

      Object.defineProperty(req, source, {
        value: validatedData,
        writable: true,
        enumerable: true,
        configurable: true,
      });

      next();
    } catch (err) {
      console.error(
        "Validation middleware error:",
        err instanceof Error ? err.message : err
      );

      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  };
}