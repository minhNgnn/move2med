import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";
import { demoMode } from "@/lib/home";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm demo={demoMode()} />
    </Suspense>
  );
}
