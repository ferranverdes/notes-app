"use strict";

const gcp = require("@pulumi/gcp");
const pulumi = require("@pulumi/pulumi");

/**
 * Create a PostgreSQL Cloud SQL instance with a public IP that cannot be reached directly from the internet.
 *
 * 1. The instance is given a public IPv4 address (ipv4Enabled: true)
 * 2. No authorised networks are defined (authorizedNetworks: []), so no external IPs are allowed to connect
 * 3. Cloud Run will still be able to connect using the Cloud SQL connector and IAM
 * 4. A database and user are created for application use
 * 5. A ready-to-use DATABASE_URL is returned, using the Cloud SQL Unix socket path
 *
 * @param {object} args
 * @param {string} args.baseName - Base resource name/prefix (e.g. "notes-sql")
 * @param {string} args.project - GCP project ID (e.g. "dev-notes-476511")
 * @param {string} args.region - GCP region for the instance (e.g. "europe-west1")
 * @param {string} args.tier - Machine tier (e.g. "db-f1-micro")
 * @param {string} args.dbName - Logical DB name (e.g. "notes")
 * @param {string} args.dbUser - DB username (e.g. "user")
 * @param {import("@pulumi/gcp").Provider} args.provider - Pulumi GCP provider
 *
 * @returns {{
 *   instance: gcp.sql.DatabaseInstance,
 *   database: gcp.sql.Database,
 *   user: gcp.sql.User,
 *   connectionName: pulumi.Output<string>,
 *   databaseUrl: pulumi.Output<string>
 * }}
 */
function createPublicPostgresInstanceLockedDown({ baseName, project, region, tier, dbName, dbUser, provider }) {
  // 1. Enable the Cloud SQL Admin API so instances can be created
  const sqlAdminApi = new gcp.projects.Service(
    `${baseName}-enable-sqladmin-api`,
    {
      project,
      service: "sqladmin.googleapis.com",
      disableOnDestroy: false
    },
    { provider }
  );

  // 2. Create the Cloud SQL instance with a public IP but no allowed inbound networks
  const instance = new gcp.sql.DatabaseInstance(
    `${baseName}-instance`,
    {
      project,
      databaseVersion: "POSTGRES_15",
      region: region,
      settings: {
        tier: tier || "db-f1-micro",
        availabilityType: "ZONAL",
        ipConfiguration: {
          ipv4Enabled: true, // assign a public IPv4 so Cloud SQL connector can work without private VPC
          authorizedNetworks: [] // empty means no IP ranges are allowed to connect over TCP
        },
        backupConfiguration: {
          enabled: true
        },
        deletionProtectionEnabled: false
      }
    },
    {
      provider,
      dependsOn: [sqlAdminApi]
    }
  );

  // 3. Create the logical database inside the instance
  const database = new gcp.sql.Database(
    `${baseName}-db`,
    {
      project,
      instance: instance.name,
      name: dbName
    },
    { provider }
  );

  // 4. Create the application user (password should later come from secret config, not hardcoded)
  const dbPassword = "TempPass123!";
  const user = new gcp.sql.User(
    `${baseName}-user`,
    {
      project,
      instance: instance.name,
      name: dbUser,
      password: dbPassword
    },
    { provider }
  );

  // 5. Build values needed by the app: instance connection name and DATABASE_URL
  const connectionName = instance.connectionName; // "<project>:<region>:<instance>"

  // Format for Prisma/Postgres using the Cloud SQL Unix socket at /cloudsql/<connectionName>
  const databaseUrl = pulumi.interpolate`postgresql://${dbUser}:${dbPassword}@localhost/${dbName}?host=/cloudsql/${connectionName}`;

  return {
    instance,
    database,
    user,
    connectionName,
    databaseUrl
  };
}

module.exports = {
  createPublicPostgresInstanceLockedDown
};
