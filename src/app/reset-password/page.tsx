import { Suspense } from "react";
import ResetPasswordForm from "./reset-password-form";

export const metadata = {
  title: "Set New Password — CK Grounds",
};

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Suspense>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
