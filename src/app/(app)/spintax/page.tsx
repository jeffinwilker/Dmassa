import { PageHeader } from "@/components/layout/page-header";
import { SpintaxClient } from "./spintax-client";

export const dynamic = "force-dynamic";

export default function SpintaxPage() {
  return (
    <div>
      <PageHeader
        title="Biblioteca Spintax"
        description="Variáveis que expandem para valores aleatórios. Use nas campanhas escrevendo {saudacao}, {nome}, etc — o worker sorteia um valor por envio."
      />
      <SpintaxClient />
    </div>
  );
}
