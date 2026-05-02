"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deleteMyAvatar, updateMyProfile, uploadMyAvatar } from "@/lib/api";

function parseOptionalString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function updateProfileAction(formData: FormData) {
  await updateMyProfile({
    email: parseOptionalString(formData, "email"),
    phone: parseOptionalString(formData, "phone"),
    position: parseOptionalString(formData, "position"),
    gender: parseOptionalString(formData, "gender"),
    bio: parseOptionalString(formData, "bio"),
  });
  const avatarFile = formData.get("avatar");
  const clearAvatar = String(formData.get("clear_avatar") ?? "").trim() === "on";
  if (avatarFile instanceof File && avatarFile.size > 0) {
    await uploadMyAvatar(avatarFile);
  } else if (clearAvatar) {
    await deleteMyAvatar();
  }
  revalidatePath("/profile");
  revalidatePath("/profile/edit");
  redirect("/profile?saved=1");
}
