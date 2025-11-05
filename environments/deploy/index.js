"use strict";

const pulumi = require("@pulumi/pulumi");
const gcp = require("@pulumi/gcp");
const fs = require("fs");
const path = require("path");

const { createPublicPostgresInstanceLockedDown } = require("../modules/cloud-sql");
const { deployPublicCloudRunWithSqlSocket, createCloudRunSeedJobWithSqlSocket } = require("../modules/cloud-run");

// 1. Load Pulumi and GCP configuration values used across the deployment.
const config = new pulumi.Config();
const env = config.require("env");

const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const projectNumber = gcpConfig.require("projectNumber");
const region = gcpConfig.require("region");
const zone = gcpConfig.get("zone") || "europe-west1-b";

// 2. Read image details from environment variables (required).
const imageName = process.env.IMAGE_NAME;
const imageDigest = process.env.IMAGE_DIGEST;

if (!imageName || !imageDigest) {
  throw new Error(
    "Missing required environment variables: IMAGE_NAME and/or IMAGE_DIGEST. " +
      "Ensure they are exported from the build stage or provided in CI/CD."
  );
}

// 3. Prepare image object expected by Cloud Run deploy function.
const image = {
  imageName,
  repoDigest: imageDigest
};

// 4. Create a GCP provider using the service account credentials for authentication.
const provider = new gcp.Provider("gcp-provider", {
  credentials: fs.readFileSync(path.resolve(__dirname, "../credentials/service-account-key.json"), "utf8"),
  project,
  region,
  zone
});

// 5. Create a locked-down Cloud SQL PostgreSQL instance accessible only through Cloud Run socket.
const postgres = createPublicPostgresInstanceLockedDown({
  baseName: "notes-sql",
  project,
  region,
  tier: "db-f1-micro",
  dbName: "notes",
  dbUser: "user",
  provider
});

// 6. Deploy a public Cloud Run service connected to the Cloud SQL instance through a Unix socket.
const cloudRunUrl = deployPublicCloudRunWithSqlSocket(
  "notes",
  image,
  env,
  region,
  postgres.databaseUrl,
  postgres.connectionName,
  provider
);

// 7. Create a Cloud Run Job that runs "npm run seed" against the same database.
const seedJobName = createCloudRunSeedJobWithSqlSocket(
  "notes",
  image,
  env,
  region,
  postgres.databaseUrl,
  postgres.connectionName,
  provider
);

// 8. Export stack outputs to view and reuse configuration values from the Pulumi CLI or other stacks.
exports.env = env;
exports.project = project;
exports.region = region;
exports.zone = zone;
exports.cloudRunUrl = cloudRunUrl;
exports.databaseUrl = postgres.databaseUrl;
exports.seedJobName = seedJobName;
