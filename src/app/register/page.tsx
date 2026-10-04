import { Suspense } from "react";
import RegisterForm from "./register-form";

export default function RegisterPage() {
  return (
    <main>
      <h1>Create admin account</h1>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </main>
  );
}
