"use strict";

const gcp = require("@pulumi/gcp");

/**
 * Enables the Cloud Resource Manager API for the specified GCP project.
 *
 * This API is essential for managing GCP projects and accessing metadata
 * such as project policies, IAM roles, and organizational hierarchy.
 *
 * It is a foundational service that other APIs (like IAM, Billing, and Folder management)
 * depend on for resource-level access and permissions control.
 *
 * @param {string} project - GCP project ID where the API should be enabled
 * @param {import("@pulumi/gcp").Provider} provider - Pulumi GCP provider instance
 * @returns {gcp.projects.Service} - Pulumi resource representing the enabled API
 */
function enableResourceManagerApi(project, provider) {
  return new gcp.projects.Service(
    "enable-cloudresourcemanager-api",
    {
      project,
      service: "cloudresourcemanager.googleapis.com",
      disableOnDestroy: false
    },
    { provider }
  );
}

module.exports = { enableResourceManagerApi };
