"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { changeMyPassword, deleteMyAvatar, updateMyProfile, uploadMyAvatar } from "../../lib/api";

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
  redirect("/profile/edit?saved=1");
}

export async function changePasswordAction(formData: FormData) {
  const currentPassword = String(formData.get("current_password") ?? "").trim();
  const newPassword = String(formData.get("new_password") ?? "").trim();
  if (!currentPassword || !newPassword) {
    redirect("/profile?pwd_error=required");
  }
  if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,64}$/.test(newPassword)) {
    redirect("/profile?pwd_error=rule");
  }

  await changeMyPassword({
    current_password: currentPassword,
    new_password: newPassword,
  });
  revalidatePath("/profile");
  revalidatePath("/profile/password");
  redirect("/logout");
}
