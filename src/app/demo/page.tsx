import { notFound } from "next/navigation";
import { DemoControl } from "@/components/DemoControl";
import { demoMode } from "@/lib/home";

export default function DemoPage() {
  if (!demoMode()) notFound();
  return <DemoControl />;
}
