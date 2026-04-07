"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { changeMyPassword, updateMyProfile } from "../../lib/api";

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
  revalidatePath("/profile");
  redirect("/profile?saved=1");
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
  redirect("/logout");
}
