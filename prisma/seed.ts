/**
 * Seed inicial:
 *  - cria usuario admin (email/senha do .env)
 *  - cria variaveis Spintax de sistema
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@dmassa.local").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, passwordHash, role: "OWNER" },
  });
  console.log(`Usuario: ${user.email}  (senha inicial: ${password})`);
  console.log(`  -> id: ${user.id}`);

  // Variaveis Spintax de sistema (ownerId = null)
  const systemVars = [
    {
      name: "saudacao",
      label: "Saudações",
      values: ["Oi", "Olá", "E aí", "Opa", "Fala"],
      description: "Cumprimentos de abertura",
    },
    {
      name: "despedida",
      label: "Despedidas",
      values: ["Abraço", "Até mais", "Grande abraço", "Abraços", "Um abraço"],
      description: "Fechamento de mensagem",
    },
    {
      name: "confirmacao",
      label: "Confirmações",
      values: ["ok", "certo", "beleza", "combinado", "fechado"],
      description: "Palavras de confirmação",
    },
    {
      name: "positivo",
      label: "Positivos",
      values: ["bom", "ótimo", "excelente", "top", "sensacional"],
      description: "Adjetivos positivos",
    },
  ];

  let inserted = 0;
  for (const v of systemVars) {
    const existing = await prisma.spintaxVariable.findFirst({
      where: { ownerId: null, name: v.name },
    });
    if (existing) {
      await prisma.spintaxVariable.update({
        where: { id: existing.id },
        data: { values: v.values, label: v.label, description: v.description },
      });
    } else {
      await prisma.spintaxVariable.create({
        data: {
          ownerId: null,
          name: v.name,
          label: v.label,
          values: v.values,
          description: v.description,
          isSystem: true,
        },
      });
      inserted++;
    }
  }
  console.log(`Variaveis Spintax de sistema: ${systemVars.length} (${inserted} novas)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
