import { Sidebar } from "@/components/layout/sidebar";
import { requireUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <Sidebar userEmail={user.email} userName={user.name} />
      <main className="md:pl-60">
        <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
