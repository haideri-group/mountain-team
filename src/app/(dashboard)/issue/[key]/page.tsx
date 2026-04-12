import { IssueDetail } from "@/components/issue/issue-detail";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  return <IssueDetail issueKey={key} />;
}
