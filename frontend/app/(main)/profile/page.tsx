import { getMyFavorites, getMyNotes } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";

import { ProfileWorkspace } from "./profile-workspace";

type ProfilePageProps = {
  searchParams?: Promise<{
    saved?: string;
    mode?: string;
    pwd_error?: string;
  }>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const currentUser = await requireCurrentUser();
  const [favorites, myNotes] = await Promise.all([getMyFavorites(), getMyNotes()]);
  const query = searchParams ? await searchParams : undefined;

  return (
    <ProfileWorkspace
      currentUser={currentUser}
      favorites={favorites}
      initialMode={query?.mode === "password" ? "password" : null}
      myNotes={myNotes}
      profileSaved={query?.saved === "1"}
      passwordError={query?.pwd_error ?? null}
    />
  );
}
