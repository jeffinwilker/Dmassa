import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function SpintaxPage() {
  return (
    <div>
      <PageHeader
        title="Biblioteca Spintax"
        description="Crie variáveis reutilizáveis para variar suas mensagens (ex.: {saudacao} = [oi, olá, e aí])."
      />
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Em construção (Fase 2). Aqui você cria e edita variáveis Spintax.
        </CardContent>
      </Card>
    </div>
  );
}
