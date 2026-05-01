import { RepositoryCarousel } from "@/components/repository-carousel";
import { getRepositories } from "@/lib/api";

export default async function RepositoriesPage() {
  const repositories = await getRepositories();

  return <RepositoryCarousel repositories={repositories} />;
}
