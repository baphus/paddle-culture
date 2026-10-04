import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main>
      <h1>Admin sign in</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
