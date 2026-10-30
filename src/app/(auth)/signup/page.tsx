import { Suspense } from "react";
import { AuthForm } from "../AuthForm";

export const metadata = { title: "Sign up · TCGLoader" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-6 text-xl font-semibold">Create your account</h1>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </>
  );
}
