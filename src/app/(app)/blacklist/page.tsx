import { PageHeader } from "@/components/layout/page-header";
import { BlacklistClient } from "./blacklist-client";

export const dynamic = "force-dynamic";

export default function BlacklistPage() {
  return (
    <div>
      <PageHeader
        title="Blacklist"
        description="Contatos que optaram por não receber mais mensagens. Opt-out automático quando responderem PARE, SAIR, STOP, REMOVER, CANCELAR."
      />
      <BlacklistClient />
    </div>
  );
}
