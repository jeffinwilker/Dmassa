import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
  role?: "OWNER" | "ADMIN" | "OPERATOR";
}

function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error(
      "SESSION_PASSWORD ausente ou curta (minimo 32 caracteres). Gere com: openssl rand -base64 48",
    );
  }
  return {
    password,
    cookieName: "dmassa_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      // 7 dias
      maxAge: 60 * 60 * 24 * 7,
    },
  };
}

export async function getSession() {
  const jar = await cookies();
  return getIronSession<SessionData>(jar, sessionOptions());
}

/** Chama de rotas server-side pra exigir usuario logado. Lanca se nao. */
export async function requireUser() {
  const s = await getSession();
  if (!s.userId) throw new Error("UNAUTHORIZED");
  return { userId: s.userId, email: s.email!, name: s.name, role: s.role! };
}
