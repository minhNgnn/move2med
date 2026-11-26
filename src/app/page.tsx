import { Landing } from "@/components/Landing";
import { demoMode } from "@/lib/home";

export default function Home() {
  return <Landing demo={demoMode()} />;
}
