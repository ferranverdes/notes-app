"use strict";

const gcp = require("@pulumi/gcp");

/**
 * Enables the Compute Engine API for the specified GCP project.
 *
 * This is required because other services (like Artifact Registry or Cloud Run)
 * rely on Compute Engine’s underlying networking and regional data.
 *
 * @param {string} project - GCP project ID where the API should be enabled
 * @param {import("@pulumi/gcp").Provider} provider - Pulumi GCP provider instance
 * @returns {gcp.projects.Service} - Pulumi resource that represents the enabled API
 */
function enableComputeEngineApi(project, provider) {
  return new gcp.projects.Service(
    "enable-compute-engine-api",
    {
      project,
      service: "compute.googleapis.com",
      disableOnDestroy: false
    },
    { provider }
  );
}

module.exports = { enableComputeEngineApi };
