import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function BlacklistPage() {
  return (
    <div>
      <PageHeader
        title="Blacklist"
        description="Números que optaram por não receber mais mensagens (opt-out automático quando o contato responde PARE, SAIR, STOP, REMOVER)."
      />
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Em construção (Fase 3).
        </CardContent>
      </Card>
    </div>
  );
}
