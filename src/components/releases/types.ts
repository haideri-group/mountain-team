export type ReleaseStatus = "on_track" | "at_risk" | "slipping" | "overdue" | "released";

export interface ReleaseReadiness {
  status: ReleaseStatus;
  reason: string;
  score: number;
  projectedShipDate: string | null;
  projectedDaysVsDue: number | null;
  riskFactors: string[];
}

export interface ReleaseListItem {
  id: string;
  name: string;
  description: string | null;
  projectKey: string;
  startDate: string | null;
  releaseDate: string | null;
  released: boolean;
  overdue: boolean;
  daysUntilDue: number | null;
  issuesDone: number;
  issuesInProgress: number;
  issuesToDo: number;
  issuesTotal: number;
  issuesDeployedStaging: number;
  issuesDeployedProduction: number;
  memberCount: number;
  lastSyncedAt: string | null;
  ownerName: string | null;
  readiness: ReleaseReadiness;
}

export interface ReleasesMetrics {
  activeReleases: number;
  scopeCreepCount: number;
  offReleaseDeploys7d: number;
}

export interface ReleasesListResponse {
  metrics: ReleasesMetrics;
  releases: ReleaseListItem[];
  projects: string[];
}

export type OffReleaseCategory = "hotfix" | "untagged" | "orphan";

export interface OffReleaseDeployment {
  id: string;
  jiraKey: string;
  category: OffReleaseCategory;
  environment: string;
  siteName: string | null;
  siteLabel: string | null;
  branch: string;
  prUrl: string | null;
  commitSha: string | null;
  deployedBy: string | null;
  deployedAt: string;
  isHotfix: boolean;
  issueTitle: string | null;
  issueType: string | null;
  issueStatus: string | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  boardKey: string;
  boardColor: string;
}

export interface OffReleaseResponse {
  windowDays: number;
  counts: {
    hotfix: number;
    untagged: number;
    orphan: number;
    total: number;
  };
  deployments: OffReleaseDeployment[];
}

export interface ReleaseDetailIssue {
  jiraKey: string;
  title: string;
  status: string;
  jiraStatusName: string | null;
  issueType: string | null;
  storyPoints: number | null;
  assigneeName: string | null;
  assigneeAvatar: string | null;
  boardKey: string;
  boardColor: string;
  deploymentStatus: "production" | "staging" | null;
  stagingSites: string[];
  productionSites: string[];
  addedToReleaseAt: string | null;
}

export interface ReleaseDetailDeployment {
  id: string;
  jiraKey: string;
  environment: string;
  siteName: string | null;
  siteLabel: string | null;
  branch: string;
  prUrl: string | null;
  commitSha: string | null;
  deployedBy: string | null;
  deployedAt: string;
  isHotfix: boolean;
}

export interface ReleaseDetailResponse {
  isAdmin: boolean;
  release: {
    id: string;
    name: string;
    description: string | null;
    projectKey: string;
    startDate: string | null;
    releaseDate: string | null;
    released: boolean;
    archived: boolean;
    overdue: boolean;
    issuesDone: number;
    issuesInProgress: number;
    issuesToDo: number;
    issuesTotal: number;
    issuesDeployedStaging: number;
    issuesDeployedProduction: number;
    lastSyncedAt: string | null;
    createdAt: string | null;
    ownerName: string | null;
    readiness: ReleaseReadiness;
  };
  issues: ReleaseDetailIssue[];
  deployments: ReleaseDetailDeployment[];
  timeline: {
    createdAt: string | null;
    firstStagingAt: string | null;
    firstProductionAt: string | null;
  };
  scopeCreep: Array<{
    jiraKey: string;
    addedAt: string;
    removedAt: string | null;
  }>;
}
