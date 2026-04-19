/**
 * Read-only diagnostic: for a given release id, show its active issues, then
 * for each issue list every `deployments` row we have. Zero writes.
 *
 * Usage:  yarn tsx scripts/diagnose-release-deployments.ts <releaseId>
 */
import "dotenv/config";
import mysql from "mysql2/promise";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const releaseId = process.argv[2];
  if (!releaseId) {
    console.error("Usage: yarn tsx scripts/diagnose-release-deployments.ts <releaseId>");
    process.exit(1);
  }

  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [[release]] = (await conn.query(
      `SELECT id, name, projectKey, releaseDate, released, issuesTotal
       FROM jira_releases WHERE id = ? LIMIT 1`,
      [releaseId],
    )) as [
      Array<{
        id: string;
        name: string;
        projectKey: string;
        releaseDate: string | null;
        released: 0 | 1;
        issuesTotal: number | null;
      }>,
      unknown,
    ];

    if (!release) {
      console.log(`[not found] release ${releaseId}`);
      return;
    }

    console.log(`Release: ${release.name}  (${release.projectKey})`);
    console.log(`  id=${release.id}`);
    console.log(`  releaseDate=${release.releaseDate}  released=${!!release.released}`);
    console.log(`  issuesTotal (JIRA rollup)=${release.issuesTotal}`);
    console.log();

    // Active memberships
    const [memberships] = (await conn.query(
      `SELECT jiraKey FROM release_issues
       WHERE releaseId = ? AND removedAt IS NULL
       ORDER BY jiraKey`,
      [releaseId],
    )) as [Array<{ jiraKey: string }>, unknown];

    console.log(`Active release_issues memberships: ${memberships.length}`);
    if (memberships.length === 0) {
      console.log(`  (no junction rows — release has no linked issues)`);
      return;
    }

    const keys = memberships.map((m) => m.jiraKey);
    const placeholders = keys.map(() => "?").join(",");

    // Deployments for those keys
    const [deps] = (await conn.query(
      `SELECT jiraKey, environment, siteName, deployedAt
       FROM deployments
       WHERE jiraKey IN (${placeholders})
       ORDER BY jiraKey, deployedAt DESC`,
      keys,
    )) as [
      Array<{
        jiraKey: string;
        environment: string;
        siteName: string | null;
        deployedAt: Date;
      }>,
      unknown,
    ];

    const depsByKey = new Map<string, typeof deps>();
    for (const d of deps) {
      const list = depsByKey.get(d.jiraKey) || [];
      list.push(d);
      depsByKey.set(d.jiraKey, list);
    }

    console.log();
    console.log(`Per-issue deployment status:`);
    console.log(`─`.repeat(80));

    let countWithDeploys = 0;
    let countProduction = 0;
    let countStaging = 0;
    let countOnlyOther = 0;

    for (const key of keys) {
      const issueDeps = depsByKey.get(key) || [];
      const envs = new Set(issueDeps.map((d) => d.environment));
      const hasProd = envs.has("production") || envs.has("canonical");
      const hasStaging = envs.has("staging");

      let icon = "  ";
      if (hasProd) {
        icon = "🚀";
        countProduction++;
      } else if (hasStaging) {
        icon = "🖥 ";
        countStaging++;
      } else if (issueDeps.length > 0) {
        icon = "❓";
        countOnlyOther++;
      }
      if (issueDeps.length > 0) countWithDeploys++;

      const envSummary = [...envs].join(",") || "(no deployments)";
      console.log(`  ${icon}  ${key.padEnd(15)} ${envSummary}`);
    }

    console.log(`─`.repeat(80));
    console.log();
    console.log(`Summary:`);
    console.log(`  issues with any deployment row: ${countWithDeploys} / ${keys.length}`);
    console.log(`  would render 🚀 Rocket (production): ${countProduction}`);
    console.log(`  would render 🖥  Server   (staging):  ${countStaging}`);
    console.log(`  have deployments but NOT staging/prod/canonical: ${countOnlyOther}`);
    console.log();

    if (countWithDeploys === 0) {
      console.log(`⚠️  No issue in this release has ANY row in the deployments table.`);
      console.log(`   → No icons will render.`);
      console.log(`   → Likely cause: the release's issues haven't been deployed via GitHub yet,`);
      console.log(`     OR the GitHub deployment-tracking webhook hasn't been triggered for them.`);
    } else if (countWithDeploys < keys.length) {
      console.log(
        `ℹ️  Only ${countWithDeploys} of ${keys.length} issues have deployments. The rest will render no icon.`,
      );
    } else {
      console.log(`✓ All issues have deployment data. Icons should render.`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
