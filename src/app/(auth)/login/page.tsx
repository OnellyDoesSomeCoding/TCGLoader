import { Suspense } from "react";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Log in · TCGLoader" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">Log in</h1>
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </>
  );
}
