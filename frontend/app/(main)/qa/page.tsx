import { getRepositories } from "@/lib/api";
import { QaClient } from "./qa-client";

export default async function QaPage() {
  const repositories = await getRepositories();

  return <QaClient repositories={repositories} />;
}
