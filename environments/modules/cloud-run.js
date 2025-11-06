"use strict";

const gcp = require("@pulumi/gcp");
const pulumi = require("@pulumi/pulumi");

/**
 * Deploy a public Cloud Run service that:
 *
 * 1. Runs a provided container image
 * 2. Uses a dedicated service account with required roles
 * 3. Connects to a Cloud SQL instance using a Unix socket
 * 4. Injects DATABASE_URL into the container
 * 5. Makes the service publicly accessible via HTTPS
 *
 * @param {string} baseName                    base name prefix for resources
 * @param {pulumi.Output<string>} image        container image info (expects .imageName and .repoDigest)
 * @param {string} env                         environment name (e.g. "development")
 * @param {string} region                      Google Cloud region (e.g. "europe-west1")
 * @param {pulumi.Output<string>|string} databaseUrl  full DATABASE_URL for the app
 * @param {pulumi.Output<string>|string} connectionName Cloud SQL connection name "<project>:<region>:<instance>"
 * @param {gcp.Provider} provider              Pulumi GCP provider for authentication
 *
 * @returns {pulumi.Output<string>}            public HTTPS URL of the deployed Cloud Run service
 */
function deployPublicCloudRunWithSqlSocket(baseName, image, env, region, databaseUrl, connectionName, provider) {
  // 1. Enable required Google Cloud APIs (Cloud Run and IAM)
  const enableRunApi = new gcp.projects.Service(
    `${baseName}-enable-run`,
    { service: "run.googleapis.com", disableOnDestroy: false },
    { provider }
  );

  const enableIamApi = new gcp.projects.Service(
    `${baseName}-enable-iam`,
    { service: "iam.googleapis.com", disableOnDestroy: false },
    { provider }
  );

  // 2. Create a dedicated service account used by Cloud Run
  const runServiceAccount = new gcp.serviceaccount.Account(
    `${baseName}-sa-cloud-run`,
    {
      accountId: `${baseName}-sa-cloud-run`,
      displayName: pulumi.interpolate`${baseName} Cloud Run Service Account`
    },
    { provider, dependsOn: [enableIamApi] }
  );

  // 3. Grant roles to the service account for Cloud SQL access and logging
  const saCloudSqlClient = new gcp.projects.IAMMember(
    `${baseName}-sa-cloudsql-client`,
    {
      project: provider.project,
      role: "roles/cloudsql.client",
      member: pulumi.interpolate`serviceAccount:${runServiceAccount.email}`
    },
    { provider, dependsOn: [runServiceAccount] }
  );

  const saLogWriter = new gcp.projects.IAMMember(
    `${baseName}-sa-log-writer`,
    {
      project: provider.project,
      role: "roles/logging.logWriter",
      member: pulumi.interpolate`serviceAccount:${runServiceAccount.email}`
    },
    { provider, dependsOn: [runServiceAccount] }
  );

  // 4. Define the Cloud Run v2 service configuration
  const service = pulumi
    .all([image.imageName, image.repoDigest, databaseUrl, connectionName, runServiceAccount.email])
    .apply(([imageName, imageDigest, dbUrl, connName, saEmail]) => {
      return new gcp.cloudrunv2.Service(
        `${baseName}-service`,
        {
          name: `${baseName}-service`,
          location: region,
          ingress: "INGRESS_TRAFFIC_ALL",
          template: {
            serviceAccount: saEmail,
            sessionAffinity: true,
            maxInstanceRequestConcurrency: 15,
            scaling: { minInstanceCount: 0, maxInstanceCount: 6 },
            containers: [
              {
                image: imageName,
                // DIGEST is used to force Cloud Run to create a new revision when the image changes,
                // even if the tag name (e.g. :latest) stays the same.
                envs: [
                  { name: "NODE_ENV", value: env },
                  { name: "DIGEST", value: imageDigest.slice(-71) },
                  { name: "DATABASE_URL", value: dbUrl }
                ],
                volumeMounts: [{ name: "cloudsql", mountPath: "/cloudsql" }],
                ports: [{ name: "http1", containerPort: 8080 }],
                resources: {
                  startupCpuBoost: true,
                  cpuIdle: false,
                  limits: { cpu: "1", memory: "512Mi" }
                }
              }
            ],
            volumes: [{ name: "cloudsql", cloudSqlInstance: { instances: [connName] } }]
          }
        },
        { provider, dependsOn: [enableRunApi, enableIamApi, saCloudSqlClient, saLogWriter] }
      );
    });

  // 5. Grant Cloud Run invocation rights based on environment, restricting or allowing access as needed
  if (env === "development") {
    // TODO: Grant roles/run.invoker to the developer IAM group for this service in the development environment.
    // Intentionally no ServiceIamMember is created here to keep the service non-invokable by default.
  } else if (env === "staging") {
    new gcp.cloudrunv2.ServiceIamMember(
      `${baseName}-staging-dast-invoker`,
      {
        name: service.name,
        location: region,
        role: "roles/run.invoker",
        member: pulumi.interpolate`serviceAccount:gitlab-dast-sa@${provider.project}.iam.gserviceaccount.com`
      },
      { provider }
    );

    // TODO: Also grant roles/run.invoker to the developer IAM group for this service in the staging environment.
  } else if (env === "production") {
    new gcp.cloudrunv2.ServiceIamMember(
      `${baseName}-public-invoker`,
      {
        name: service.name,
        location: region,
        role: "roles/run.invoker",
        member: "allUsers"
      },
      { provider }
    );
  }

  // 6. Return the public URL of the deployed service
  return service.uri;
}

/**
 * Create a Cloud Run Job that:
 *
 * 1. Enables the required Google Cloud APIs (Cloud Run and IAM)
 * 2. Uses its own dedicated service account
 * 3. Connects to the same Cloud SQL instance via Unix socket
 * 4. Runs "npm run seed" to populate the database
 * 5. Reuses DATABASE_URL and DIGEST env vars for consistency with the app
 *
 * @param {string} baseName                    base name prefix for resources
 * @param {{ imageName: pulumi.Input<string>, repoDigest: pulumi.Input<string> }} image
 * @param {string} env                         environment name (e.g. "development")
 * @param {string} region                      Google Cloud region (e.g. "europe-west1")
 * @param {pulumi.Output<string>|string} databaseUrl  full DATABASE_URL for the seed job
 * @param {pulumi.Output<string>|string} connectionName Cloud SQL connection name "<project>:<region>:<instance>"
 * @param {gcp.Provider} provider              Pulumi GCP provider for authentication
 *
 * @returns {pulumi.Output<string>}            name of the Cloud Run job
 */
function createCloudRunSeedJobWithSqlSocket(baseName, image, env, region, databaseUrl, connectionName, provider) {
  // 1. Enable required Google Cloud APIs for the seed job path as well
  const enableRunApi = new gcp.projects.Service(
    `${baseName}-seed-enable-run`,
    { service: "run.googleapis.com", disableOnDestroy: false },
    { provider }
  );

  const enableIamApi = new gcp.projects.Service(
    `${baseName}-seed-enable-iam`,
    { service: "iam.googleapis.com", disableOnDestroy: false },
    { provider }
  );

  // 2. Create a dedicated service account used by the Cloud Run Job
  const jobServiceAccount = new gcp.serviceaccount.Account(
    `${baseName}-sa-cloud-run-seed`,
    {
      accountId: `${baseName}-sa-cloud-run-seed`,
      displayName: pulumi.interpolate`${baseName} Cloud Run seed job service account`
    },
    { provider, dependsOn: [enableIamApi] }
  );

  // 3. Grant roles to the job service account for Cloud SQL access and logging
  const jobSaCloudSqlClient = new gcp.projects.IAMMember(
    `${baseName}-seed-sa-cloudsql-client`,
    {
      project: provider.project,
      role: "roles/cloudsql.client",
      member: pulumi.interpolate`serviceAccount:${jobServiceAccount.email}`
    },
    { provider, dependsOn: [jobServiceAccount] }
  );

  const jobSaLogWriter = new gcp.projects.IAMMember(
    `${baseName}-seed-sa-log-writer`,
    {
      project: provider.project,
      role: "roles/logging.logWriter",
      member: pulumi.interpolate`serviceAccount:${jobServiceAccount.email}`
    },
    { provider, dependsOn: [jobServiceAccount] }
  );

  // 4. Define the Cloud Run v2 Job that runs "npm run seed"
  const job = pulumi
    .all([image.imageName, image.repoDigest, databaseUrl, connectionName, jobServiceAccount.email])
    .apply(([imageName, imageDigest, dbUrl, connName, saEmail]) => {
      return new gcp.cloudrunv2.Job(
        `${baseName}-seed-job`,
        {
          name: `${baseName}-seed-job`,
          location: region,
          template: {
            template: {
              serviceAccount: saEmail,
              containers: [
                {
                  image: imageName,
                  command: ["npm"],
                  args: ["run", "seed"],
                  // DIGEST is used to force Cloud Run to create a new revision when the image changes,
                  // even if the tag name (e.g. :latest) stays the same.
                  envs: [
                    { name: "NODE_ENV", value: env },
                    { name: "DIGEST", value: imageDigest.slice(-71) },
                    { name: "DATABASE_URL", value: dbUrl }
                  ],
                  volumeMounts: [{ name: "cloudsql", mountPath: "/cloudsql" }],
                  resources: {
                    limits: { cpu: "1", memory: "512Mi" }
                  }
                }
              ],
              volumes: [{ name: "cloudsql", cloudSqlInstance: { instances: [connName] } }]
            }
          }
        },
        {
          provider,
          dependsOn: [enableRunApi, enableIamApi, jobSaCloudSqlClient, jobSaLogWriter]
        }
      );
    });

  // 5. Return the job name (e.g. "notes-seed-job")
  return job.name;
}

module.exports = {
  deployPublicCloudRunWithSqlSocket,
  createCloudRunSeedJobWithSqlSocket
};
