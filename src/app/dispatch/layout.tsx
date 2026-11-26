import { Shell } from "@/components/Shell";
import { requirePage } from "@/lib/session";

export default async function DispatchLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePage(["dispatcher"]);
  return <Shell session={s} wide subtitle="Dispatcher portal">{children}</Shell>;
}
