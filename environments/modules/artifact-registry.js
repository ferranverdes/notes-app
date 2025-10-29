"use strict";

const gcp = require("@pulumi/gcp");
const pulumi = require("@pulumi/pulumi");
const docker = require("@pulumi/docker");

/**
 * Creates a Docker-compatible Artifact Registry repository in the specified region.
 *
 * This function:
 * - Enables the Artifact Registry API (`artifactregistry.googleapis.com`) for the project.
 * - Creates a Docker-format repository for storing container images.
 * - Accepts an optional `dependsOn` array to ensure other APIs (like Compute Engine)
 *   are enabled before creating the repository.
 *
 * @param {string} name - Repository name and identifier (used for both resource name and repo ID).
 * @param {string} region - GCP region where the repository will be hosted.
 * @param {gcp.Provider} provider - Pulumi GCP provider instance for managing resources.
 * @param {pulumi.Resource[]} [dependsOn=[]] - Optional dependencies to enforce creation order.
 * @returns {gcp.artifactregistry.Repository} The created Artifact Registry repository resource.
 */
function createArtifactRegistryRepository(name, region, provider, dependsOn = []) {
  // Enable the Artifact Registry API, required for managing container image repositories
  const artifactRegistryApi = new gcp.projects.Service(
    `${name}-enable-artifactregistry-api`,
    {
      service: "artifactregistry.googleapis.com",
      disableOnDestroy: false
    },
    { provider }
  );

  // Create a Docker-format repository in Artifact Registry
  const repository = new gcp.artifactregistry.Repository(
    name,
    {
      repositoryId: name,
      format: "DOCKER",
      location: region,
      description: "Docker image repo for Cloud Run apps"
    },
    {
      provider,
      dependsOn: [artifactRegistryApi, ...dependsOn]
    }
  );

  // Return the repository resource
  return repository;
}

/**
 * Builds a Docker image from a local directory and pushes it to Artifact Registry.
 *
 * This function:
 * - Builds the image using the specified local path as Docker context.
 * - Tags and pushes the image to the configured Artifact Registry repository.
 * - Returns the image reference and digest for later use.
 *
 * @param {string} name - Logical name for the Pulumi Docker image resource.
 * @param {string} localPath - Local file path to the Docker build context.
 * @param {string} project - GCP project ID that owns the Artifact Registry.
 * @param {string} region - Region of the Artifact Registry repository.
 * @param {string} repository - Name of the target Artifact Registry repository.
 * @returns {pulumi.Output<{imageName: string, repoDigest: string}>} Object containing image name and digest.
 */
function buildAndPushDockerImage(name, localPath, project, region, repository) {
  // Construct the image name following Artifact Registry's required format
  const imageName = pulumi.interpolate`${region}-docker.pkg.dev/${project}/${repository}/${name}`;

  // Build and push the Docker image to the specified Artifact Registry repository
  const image = new docker.Image(name, {
    build: {
      context: localPath,
      platform: "linux/amd64" // Ensures compatibility with Cloud Run
    },
    imageName: imageName
  });

  // Return both the image reference and its content-addressable digest
  return pulumi.output({
    imageName: image.imageName,
    repoDigest: image.repoDigest
  });
}

module.exports = {
  buildAndPushDockerImage,
  createArtifactRegistryRepository
};
