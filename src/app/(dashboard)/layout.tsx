import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { auth } from "@/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {isLoggedIn && <Sidebar />}
      <div className="flex flex-col flex-1 overflow-hidden">
        <Topbar
          userName={session?.user?.name || ""}
          userEmail={session?.user?.email || ""}
          userRole={(session?.user as { role?: string })?.role || "user"}
          userImage={session?.user?.image}
          isLoggedIn={isLoggedIn}
        />
        <main className="flex-1 overflow-y-auto p-8 relative">{children}</main>
      </div>
    </div>
  );
}
