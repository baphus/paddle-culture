import { Suspense } from "react";
import Image from "next/image";
import LoginForm from "./login-form";

export const metadata = {
  title: "Admin Sign In — CK Grounds",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-cream px-4 py-12">
      <div className="w-full max-w-sm animate-[rise_0.3s_ease-out_both]">
        {/* Logo + brand */}
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <a href="/" aria-label="Back to CK Grounds">
            <Image
              src="/logo.jpg"
              alt="CK Grounds"
              width={56}
              height={56}
              className="size-14 rounded-full object-cover shadow-[0_4px_14px_rgba(66,48,45,0.15)]"
              priority
            />
          </a>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-warm-muted">
              CK Grounds
            </p>
            <h1 className="mt-0.5 text-xl font-extrabold tracking-tight text-ink">
              Admin sign in
            </h1>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-line bg-white p-6 shadow-[0_8px_30px_rgba(66,48,45,0.08)]">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-4 text-center text-xs text-warm-muted">
          <a href="/" className="hover:text-flame hover:underline">
            ← Back to site
          </a>
        </p>
      </div>
    </main>
  );
}
