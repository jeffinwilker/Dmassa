import { PageHeader } from "@/components/layout/page-header";
import { ContactsClient } from "./contacts-client";

export const dynamic = "force-dynamic";

export default function ContactsPage() {
  return (
    <div>
      <PageHeader
        title="Contatos"
        description="Gerencie contatos, tags, importe CSV/XLSX ou cole uma lista de números."
      />
      <ContactsClient />
    </div>
  );
}
