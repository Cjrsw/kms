"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { changeMyPassword, deleteMyAvatar, updateMyProfile, uploadMyAvatar } from "@/lib/api";

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

export async function changePasswordAction(formData: FormData) {
  const currentPassword = String(formData.get("current_password") ?? "").trim();
  const newPassword = String(formData.get("new_password") ?? "").trim();
  const confirmPassword = String(formData.get("confirm_password") ?? "").trim();
  if (!currentPassword || !newPassword || !confirmPassword) {
    redirect("/profile?mode=password&pwd_error=required");
  }
  if (newPassword !== confirmPassword) {
    redirect("/profile?mode=password&pwd_error=confirm");
  }
  if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,64}$/.test(newPassword)) {
    redirect("/profile?mode=password&pwd_error=rule");
  }

  try {
    await changeMyPassword({
      current_password: currentPassword,
      new_password: newPassword,
    });
  } catch {
    redirect("/profile?mode=password&pwd_error=incorrect");
  }
  revalidatePath("/profile");
  revalidatePath("/profile/password");
  redirect("/logout");
}
