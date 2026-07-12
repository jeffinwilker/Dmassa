import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function ContactsPage() {
  return (
    <div>
      <PageHeader
        title="Contatos"
        description="Gerencie sua lista de contatos, tags e importação CSV/XLSX."
      />
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          Em construção (Fase 2). Aqui vai upload de CSV/XLSX, filtro por tag, edição.
        </CardContent>
      </Card>
    </div>
  );
}
