const swaggerJSDoc = require("swagger-jsdoc");
const fs = require("fs");
const path = require("path");

const options = {
  definition: {
    openapi: "3.1.0",
    info: { title: "Notes API", version: "1.0.0" }
  },
  apis: ["src/**/*.js"]
};

const spec = swaggerJSDoc(options);

fs.writeFileSync(path.join(__dirname, "openapi.json"), JSON.stringify(spec, null, 2));
