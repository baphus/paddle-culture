import { Suspense } from "react";
import RegisterForm from "./register-form";

export const metadata = {
  title: "Create Admin Account — CK Grounds",
};

export default function RegisterPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <Suspense>
          <RegisterForm />
        </Suspense>
      </div>

      <p className="text-xs text-muted-foreground">
        <a href="/" className="underline-offset-4 hover:underline">
          ← Back to site
        </a>
      </p>
    </main>
  );
}
