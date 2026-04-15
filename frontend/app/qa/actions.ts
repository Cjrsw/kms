"use server";

import { askQa, updateMyModelPreference } from "../../lib/api";

export type QaInteractionState = {
  question: string;
  repositorySlug: string;
  modelId: number | null;
  response: Awaited<ReturnType<typeof askQa>> | null;
  notice: string | null;
};

export async function askQaAction(
  _prevState: QaInteractionState,
  formData: FormData
): Promise<QaInteractionState> {
  const question = String(formData.get("question") ?? "").trim();
  const repositorySlug = String(formData.get("repository_slug") ?? "").trim();
  const modelIdRaw = String(formData.get("model_id") ?? "").trim();
  const saveAsDefault = String(formData.get("save_as_default") ?? "").trim() === "on";

  const modelId = modelIdRaw ? Number(modelIdRaw) : null;
  if (!question) {
    return {
      question,
      repositorySlug,
      modelId: Number.isFinite(modelId ?? NaN) ? modelId : null,
      response: {
        status: "failed",
        data: null,
        error: {
          error_code: "empty_question",
          error_category: "validation",
          user_message: "请输入问题后再发送。",
          hint: "问题不能为空。",
          trace_id: "",
        },
      },
      notice: null,
    };
  }

  const normalizedModelId = Number.isFinite(modelId ?? NaN) ? modelId : null;
  const response = await askQa({
    question,
    repository_slug: repositorySlug || undefined,
    model_id: normalizedModelId,
  });

  let notice: string | null = null;
  if (saveAsDefault && normalizedModelId) {
    await updateMyModelPreference({ chat_model_id: normalizedModelId });
    notice = "已保存为你的默认问答模型。";
  }

  return {
    question,
    repositorySlug,
    modelId: normalizedModelId,
    response,
    notice,
  };
}
