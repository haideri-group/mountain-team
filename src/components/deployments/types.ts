export interface DeploymentMetrics {
  deploymentsThisWeek: number;
  pendingReleases: number;
  statusMismatches: number;
  avgDaysInStaging: number;
}

export interface Mismatch {
  jiraKey: string;
  title: string;
  status: string;
  jiraStatusName: string | null;
  issueType: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  boardKey: string;
  boardColor: string;
  environment: string;
  siteName: string | null;
  siteLabel: string | null;
  deployedAt: string;
  daysSinceDeployment: number;
  type:
    | "production_not_updated"
    | "staging_status_behind"
    | "partial_rollout"
    | "closed_but_deployed";
  brands: string | null;
  deployedSites: string[];
  expectedSites: string[] | null;
  missingSites: string[];
  severity: "critical" | "warning" | "info";
}

export interface SiteStaleness {
  daysSinceLastDeploy: number | null;
  isStale: boolean;
}

export interface PipelineTask {
  jiraKey: string;
  title: string;
  status: string;
  jiraStatusName: string | null;
  issueType: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  boardKey: string;
  boardColor: string;
  deploymentStatus: "production" | "staging" | null;
  daysInStatus: number;
  brands: string | null;
  deployedSites: string[];
  expectedSites: string[] | null;
}

export interface PendingRelease {
  jiraKey: string;
  title: string;
  issueType: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  boardKey: string;
  boardColor: string;
  siteName: string | null;
  siteLabel: string | null;
  stagedAt: string;
  daysPending: number;
}

export interface RecentDeployment {
  id: string;
  jiraKey: string;
  issueTitle: string | null;
  issueType: string | null;
  environment: string;
  siteName: string | null;
  siteLabel: string | null;
  branch: string;
  prUrl: string | null;
  commitSha: string | null;
  deployedBy: string | null;
  deployedAt: string;
  isHotfix: boolean;
  repoName: string;
  boardKey: string;
  boardColor: string;
}

export interface SiteStatus {
  siteName: string;
  siteLabel: string | null;
  latestStaging: { jiraKey: string; deployedAt: string; branch: string } | null;
  latestProduction: { jiraKey: string; deployedAt: string; branch: string } | null;
  lastDeployAt: string | null;
  daysSinceLastDeploy: number | null;
  isStale: boolean;
}

export interface ReleaseIssue {
  jiraKey: string;
  title: string;
  status: string;
  issueType: string | null;
  assigneeName: string | null;
  boardColor: string;
  deploymentStatus: "production" | "staging" | null;
}

export interface Release {
  id: string;
  name: string;
  description: string | null;
  projectKey: string;
  startDate: string | null;
  releaseDate: string | null;
  released: boolean;
  overdue: boolean;
  issuesDone: number;
  issuesInProgress: number;
  issuesToDo: number;
  issuesTotal: number;
  issuesDeployedStaging: number;
  issuesDeployedProduction: number;
  issues: ReleaseIssue[];
}

export interface DeploymentsData {
  metrics: DeploymentMetrics;
  mismatches: Mismatch[];
  pipeline: {
    readyForTesting: PipelineTask[];
    readyForLive: PipelineTask[];
    rollingOut: PipelineTask[];
    postLiveTesting: PipelineTask[];
  };
  pendingReleases: PendingRelease[];
  recentDeployments: RecentDeployment[];
  siteOverview: SiteStatus[];
  releases: {
    upcoming: Release[];
    recent: Release[];
  };
  repos: { id: string; fullName: string }[];
  sites: string[];
  boards: { jiraKey: string; name: string; color: string | null }[];
}
