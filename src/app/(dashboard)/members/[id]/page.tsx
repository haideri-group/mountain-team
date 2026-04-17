import { auth } from "@/auth";
import { MemberProfile } from "@/components/profile/member-profile";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  return <MemberProfile memberId={id} isAdmin={isAdmin} />;
}
