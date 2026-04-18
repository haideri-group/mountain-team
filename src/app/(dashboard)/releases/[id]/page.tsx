import { ReleaseDetail } from "@/components/releases/release-detail";

export default async function ReleaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ReleaseDetail releaseId={id} />;
}
