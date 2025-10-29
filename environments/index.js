"use strict";

const pulumi = require("@pulumi/pulumi");
const gcp = require("@pulumi/gcp");
const fs = require("fs");
const path = require("path");

const { buildAndPushDockerImage, createArtifactRegistryRepository } = require("./modules/artifact-registry");
const { enableComputeEngineApi } = require("./modules/compute-engine");
const { enableResourceManagerApi } = require("./modules/resource-manager");
const { createPublicPostgresInstanceLockedDown } = require("./modules/cloud-sql");
const { deployPublicCloudRunWithSqlSocket } = require("./modules/cloud-run");

// 1. Load Pulumi and GCP configuration values used across the deployment.
const config = new pulumi.Config();
const env = config.require("env");

const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const projectNumber = gcpConfig.require("projectNumber");
const region = gcpConfig.require("region");
const zone = gcpConfig.get("zone") || "europe-west1-b";

// 2. Create a GCP provider using the service account credentials for authentication.
const provider = new gcp.Provider("gcp-provider", {
  credentials: fs.readFileSync(path.resolve(__dirname, "./credentials/service-account-key.json"), "utf8"),
  project,
  region,
  zone
});

// 3. Enable required Google Cloud APIs for Compute Engine and Resource Manager.
const computeEngineApi = enableComputeEngineApi(project, provider);
const cloudResourceManagerApi = enableResourceManagerApi(project, provider);

// 4. Create a locked-down Cloud SQL PostgreSQL instance accessible only through Cloud Run socket.
const postgres = createPublicPostgresInstanceLockedDown({
  baseName: "notes-sql",
  project,
  region,
  tier: "db-f1-micro",
  dbName: "notes",
  dbUser: "user",
  provider
});

// 5. Create an Artifact Registry repository to host Docker images for the app.
const repository = createArtifactRegistryRepository("notes-repo", region, provider, [
  computeEngineApi,
  cloudResourceManagerApi
]);

// 6. Build and push the application Docker image to the created Artifact Registry repository.
const image = buildAndPushDockerImage(
  "notes-app",
  path.resolve(__dirname, "../app"),
  project,
  region,
  repository.repositoryId
);

// 7. Deploy a public Cloud Run service connected to the Cloud SQL instance through a Unix socket.
const cloudRunUrl = deployPublicCloudRunWithSqlSocket(
  "notes",
  image,
  env,
  region,
  projectNumber,
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
exports.imageName = image.imageName;
