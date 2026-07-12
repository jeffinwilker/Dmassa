import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function CampaignsPage() {
  return (
    <div>
      <PageHeader
        title="Campanhas"
        description="Crie e acompanhe seus disparos em massa."
      />
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Em construção (Fase 3). Wizard de campanha, editor com Spintax, delays, agendamento.
        </CardContent>
      </Card>
    </div>
  );
}
