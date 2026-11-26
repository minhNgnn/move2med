import { Suspense } from "react";
import { StatusApp } from "@/components/StatusApp";

export default function StatusPage() {
  return (
    <Suspense>
      <StatusApp />
    </Suspense>
  );
}
