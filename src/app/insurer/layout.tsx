import { Shell } from "@/components/Shell";
import { requirePage } from "@/lib/session";

export default async function InsurerLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePage(["insurer"]);
  return <Shell session={s} wide>{children}</Shell>;
}
