import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Relatórios" description="Métricas de entrega por campanha." />
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Em construção (Fase 4).
        </CardContent>
      </Card>
    </div>
  );
}
