"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import { Camera, Check, Trash2, User, X } from "lucide-react";

import { getCroppedImg } from "./crop-utils";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

type ProfileAvatarInputProps = {
  defaultPreviewUrl?: string | null;
  displayName: string;
};

export function ProfileAvatarInput({ defaultPreviewUrl, displayName }: ProfileAvatarInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(defaultPreviewUrl || null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isCropping, setIsCropping] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  useEffect(() => {
    setPreviewUrl(defaultPreviewUrl || null);
    setIsDeleted(false);
  }, [defaultPreviewUrl]);

  const onCropComplete = useCallback((_: any, areaPixels: any) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_AVATAR_SIZE) {
      window.alert("头像图片不能超过 5MB。");
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setIsCropping(true);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmCrop = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
    if (!croppedBlob) return;

    const objectUrl = URL.createObjectURL(croppedBlob);
    setPreviewUrl(objectUrl);
    setIsCropping(false);
    setIsDeleted(false);

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([croppedBlob], "avatar.webp", { type: "image/webp" }));
    if (inputRef.current) {
      inputRef.current.files = dataTransfer.files;
    }
  };

  const handleDeleteAvatar = () => {
    setPreviewUrl(null);
    setIsDeleted(true);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        accept="image/png,image/jpeg,image/webp"
        name="avatar"
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
      {isDeleted ? <input type="hidden" name="clear_avatar" value="on" /> : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100">
          {previewUrl ? (
            <img alt={`${displayName} avatar`} className="h-full w-full object-cover" src={previewUrl} />
          ) : (
            <span className="text-2xl font-bold text-slate-500">{displayName.slice(0, 1) || <User className="h-6 w-6" />}</span>
          )}
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Camera className="h-4 w-4" />
            选择头像
          </button>
          {previewUrl ? (
            <div>
              <button
                type="button"
                onClick={handleDeleteAvatar}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-rose-600 transition-colors hover:text-rose-700"
              >
                <Trash2 className="h-4 w-4" />
                移除头像
              </button>
            </div>
          ) : null}
          <p className="text-xs text-slate-500">支持 PNG、JPG、WEBP，小于 5MB。保存资料后生效。</p>
        </div>
      </div>

      {isCropping && imageSrc ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">裁剪头像</h3>
              <button type="button" onClick={() => setIsCropping(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="relative h-[60vh] bg-slate-950">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 bg-slate-50 px-6 py-4">
              <input
                type="range"
                min={1}
                max={3}
                step={0.1}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="h-1.5 w-full appearance-none rounded-full bg-slate-200"
              />
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setIsCropping(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">
                  取消
                </button>
                <button type="button" onClick={handleConfirmCrop} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white">
                  <Check className="h-4 w-4" />
                  确认
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
