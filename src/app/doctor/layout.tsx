import { Shell } from "@/components/Shell";
import { requirePage } from "@/lib/session";

export default async function DoctorLayout({ children }: { children: React.ReactNode }) {
  const s = await requirePage(["doctor"]);
  return <Shell session={s} wide>{children}</Shell>;
}
