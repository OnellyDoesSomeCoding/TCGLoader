"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";

export type AuthFormState = { error?: string; username?: string } | undefined;

const credentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(24, "Username must be at most 24 characters.")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only use letters, numbers and underscores."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(72, "Password must be at most 72 characters."),
});

// Only allow redirects back to pages on this site.
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export async function signup(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  const username = String(formData.get("username") ?? "");
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, username };
  }

  // Usernames are unique regardless of letter case.
  const existing = await db.user.findFirst({
    where: { username: { equals: parsed.data.username, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return { error: "That username is already taken.", username };

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await db.user.create({
    data: { username: parsed.data.username, passwordHash },
  });

  await createSession({ userId: user.id, username: user.username });
  redirect(safeNext(formData.get("next")));
}

export async function login(_state: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) {
    return { error: "Enter your username and password.", username };
  }

  const user = await db.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" } },
  });
  const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !valid) return { error: "Wrong username or password.", username };

  await createSession({ userId: user.id, username: user.username });
  redirect(safeNext(formData.get("next")));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
