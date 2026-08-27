import swaggerJSDoc from "swagger-jsdoc";
import { ENV } from "./env.js";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ReelTube APP API",
      version: "1.0.0",
      description: "Complete REST API documentation for ReelTube APP - A ReelTube platform with secure authentication and user management",
      contact: {
        name: "ReelTube Team",
        url: "https://ReelTube.ae",
      },
    },
    servers: [
      {
        url: ENV.BACKEND_URL || "http://localhost:4000",
        description: ENV.NODE_ENV,
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "JWT token obtained after successful login",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: {
              type: "string",
            },
            message: {
              type: "string",
            },
            statusCode: {
              type: "number",
            },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./src/routes/**/*.ts", "./src/routes/**/*.js", "./src/modules/**/*.ts", "./src/modules/**/*.js"],
};

export const swaggerSpec = swaggerJSDoc(swaggerOptions);
