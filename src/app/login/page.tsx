"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

// useSearchParams em Next 15 exige Suspense boundary — por isso separamos
// o form em um componente interno.
function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search.get("next") ?? "/dashboard";
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (search.get("error") === "config") {
      toast.error("SESSION_PASSWORD não configurada. Veja o README.");
    }
  }, [search]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao entrar");
        return;
      }
      router.push(nextPath);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          autoComplete="email"
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mt-1.5"
        />
      </div>
      <div>
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          required
          className="mt-1.5"
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="bg-primary text-primary-foreground rounded-xl p-3 mb-3">
              <Send className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold">Dmassa</h1>
            <p className="text-sm text-muted-foreground">Faça login para continuar.</p>
          </div>
          <React.Suspense fallback={<div className="h-40" />}>
            <LoginForm />
          </React.Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
