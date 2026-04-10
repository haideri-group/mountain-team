import { MemberProfile } from "@/components/profile/member-profile";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <MemberProfile memberId={id} />;
}
