import swaggerUi from "swagger-ui-express";

// Simple auto-generated Swagger definition
const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Lead Management API",
    version: "1.0.0",
    description: "Auto-generated API documentation",
  },
  servers: [
    {
      url:
        process.env.NODE_ENV === "production"
          ? "https://backend.jazzam.ai/api/v1"
          : "http://localhost:4000/api/v1",
      description: "API Server",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string", example: "Error message" },
        },
      },
      Success: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Success" },
          data: { type: "object" },
        },
      },
    },
  },
  paths: {
    // Auto-generated paths based on common patterns
    "/": {
      get: {
        summary: "API Health Check",
        tags: ["Health"],
        responses: {
          200: { description: "API is running" },
        },
      },
    },
    "/health": {
      get: {
        summary: "Health Status",
        tags: ["Health"],
        responses: {
          200: { description: "Healthy" },
        },
      },
    },
    "/api/v1/companies/auth/register": {
      post: {
        summary: "Register Company",
        tags: ["Authentication"],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  companyName: { type: "string" },
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                  logo: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Company registered" },
          400: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/companies/auth/login": {
      post: {
        summary: "Login Company",
        tags: ["Authentication"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Login successful" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/companies/auth/logout": {
      post: {
        summary: "Logout Company",
        tags: ["Authentication"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Logout successful" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/companies/auth/current-company": {
      get: {
        summary: "Get Current Company",
        tags: ["Companies"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Company details" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/companies/auth/update-company": {
      patch: {
        summary: "Update Company",
        tags: ["Companies"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  companyName: { type: "string" },
                  email: { type: "string", format: "email" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Company updated" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/companies/logo": {
      patch: {
        summary: "Update Logo",
        tags: ["Companies"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  logo: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Logo updated" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/companies/subscription": {
      patch: {
        summary: "Update Subscription",
        tags: ["Companies"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Subscription updated" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/companies/delete-account": {
      delete: {
        summary: "Delete Account",
        tags: ["Companies"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Account deleted" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/leads/create": {
      post: {
        summary: "Create Lead",
        tags: ["Leads"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  firstName: { type: "string" },
                  lastName: { type: "string" },
                  email: { type: "string", format: "email" },
                  phone: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Lead created" },
          400: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/leads/all": {
      get: {
        summary: "Get All Leads",
        tags: ["Leads"],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
          { name: "status", in: "query", schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Leads retrieved" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/leads/search": {
      get: {
        summary: "Search Leads",
        tags: ["Leads"],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "query", in: "query", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: {
          200: { description: "Search results" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/leads/stats": {
      get: {
        summary: "Get Lead Statistics",
        tags: ["Leads"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Statistics" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/leads/{id}": {
      get: {
        summary: "Get Lead by ID",
        tags: ["Leads"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Lead details" },
          404: { $ref: "#/components/schemas/Error" },
        },
      },
      patch: {
        summary: "Update Lead",
        tags: ["Leads"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Lead updated" },
          404: { $ref: "#/components/schemas/Error" },
        },
      },
      delete: {
        summary: "Delete Lead",
        tags: ["Leads"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Lead deleted" },
          404: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/leads/{id}/status": {
      patch: {
        summary: "Update Lead Status",
        tags: ["Leads"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Status updated" },
          404: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/forms": {
      get: {
        summary: "Get All Forms",
        tags: ["Forms"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Forms retrieved" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
      post: {
        summary: "Create Form",
        tags: ["Forms"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  description: { type: "string" },
                  fields: { type: "array" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Form created" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/forms/{id}": {
      get: {
        summary: "Get Form by ID",
        tags: ["Forms"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Form details" },
          404: { $ref: "#/components/schemas/Error" },
        },
      },
      put: {
        summary: "Update Form",
        tags: ["Forms"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Form updated" },
          404: { $ref: "#/components/schemas/Error" },
        },
      },
      delete: {
        summary: "Delete Form",
        tags: ["Forms"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: { description: "Form deleted" },
          404: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/waitlist": {
      post: {
        summary: "Join Waitlist",
        tags: ["Waitlist"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", format: "email" },
                  companyName: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Added to waitlist" },
          400: { $ref: "#/components/schemas/Error" },
        },
      },
      get: {
        summary: "Get Waitlist",
        tags: ["Waitlist"],
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Waitlist entries" },
          401: { $ref: "#/components/schemas/Error" },
        },
      },
    },
    "/api/v1/webhook": {
      post: {
        summary: "Webhook Endpoint",
        tags: ["Webhooks"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
              },
            },
          },
        },
        responses: {
          200: { description: "Webhook processed" },
          400: { $ref: "#/components/schemas/Error" },
        },
      },
    },
  },
};

// Swagger UI options
const swaggerUiOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #3b82f6; }
  `,
  customSiteTitle: "Lead Management API",
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    filter: true,
    docExpansion: "none",
  },
};

export { swaggerDefinition, swaggerUi, swaggerUiOptions };
