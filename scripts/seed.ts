import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { seedAll } = await import("../src/db/seed");
  console.log(await seedAll());
  process.exit(0);
}
main();
