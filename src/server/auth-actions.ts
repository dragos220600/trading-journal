"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  claimOrphanData,
  createSession,
  destroySession,
  hashPassword,
  verifyPassword,
} from "./auth";

export interface AuthState {
  error: string | null;
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password needs at least 8 characters"),
});

export async function registerAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const name =
    z.string().trim().max(80).catch("").parse(formData.get("name")) || null;

  const existing = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .get();
  if (existing) return { error: "An account with this email already exists." };

  const user = db
    .insert(users)
    .values({
      email: parsed.data.email,
      passwordHash: hashPassword(parsed.data.password),
      name,
    })
    .returning()
    .get();

  claimOrphanData(user.id);
  await createSession(user.id);
  redirect("/");
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = z
    .string()
    .trim()
    .toLowerCase()
    .catch("")
    .parse(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  const user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { error: "Wrong email or password." };
  }

  await createSession(user.id);
  redirect("/");
}

export async function signOutAction() {
  await destroySession();
  redirect("/login");
}
