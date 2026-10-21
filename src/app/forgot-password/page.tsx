import { Suspense } from "react";
import ForgotPasswordForm from "./forgot-password-form";

export const metadata = {
  title: "Forgot Password — CK Grounds",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense>
          <ForgotPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
