"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Smartphone,
  Users,
  Megaphone,
  Wand2,
  BarChart3,
  Ban,
  Send,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/instances", label: "Instâncias", icon: Smartphone },
  { href: "/contacts", label: "Contatos", icon: Users },
  { href: "/spintax", label: "Spintax", icon: Wand2 },
  { href: "/campaigns", label: "Campanhas", icon: Megaphone },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
  { href: "/blacklist", label: "Blacklist", icon: Ban },
];

interface Props {
  userEmail?: string;
  userName?: string | null;
}

export function Sidebar({ userEmail, userName }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 border-r bg-card">
      <div className="flex items-center gap-2 px-6 h-16 border-b">
        <div className="bg-primary text-primary-foreground rounded-lg p-1.5">
          <Send className="h-4 w-4" />
        </div>
        <span className="font-semibold text-lg">Dmassa</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3 space-y-2">
        {userEmail && (
          <div className="px-3 py-1">
            <div className="text-xs font-medium truncate">{userName ?? userEmail}</div>
            {userName && (
              <div className="text-xs text-muted-foreground truncate">{userEmail}</div>
            )}
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-muted-foreground"
          onClick={logout}
        >
          <LogOut /> Sair
        </Button>
      </div>
    </aside>
  );
}
