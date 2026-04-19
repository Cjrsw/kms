"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import Cropper from "react-easy-crop";
import { X, Check, UploadCloud, Image as ImageIcon, Trash2 } from "lucide-react";
import { getCroppedImg } from "./crop-utils";

const MAX_REPOSITORY_COVER_SIZE = 10 * 1024 * 1024;

type RepositoryCoverInputProps = {
  defaultPreviewUrl?: string | null;
  hasDefaultUpload?: boolean;
};

export function RepositoryCoverInput({ defaultPreviewUrl, hasDefaultUpload }: RepositoryCoverInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  
  // 用于向用户展示预览图（已有或新裁剪的）
  const [previewUrl, setPreviewUrl] = useState<string | null>(defaultPreviewUrl || null);
  const [isCropping, setIsCropping] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  useEffect(() => {
    setPreviewUrl(defaultPreviewUrl || null);
    setIsDeleted(false);
  }, [defaultPreviewUrl]);

  const onCropComplete = useCallback((croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_REPOSITORY_COVER_SIZE) {
      window.alert("仓库封面图片不能超过 10MB，请重新选择。");
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

    try {
      const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (croppedBlob) {
        // 创建预览 URL 以展示在 UI 上
        const objectUrl = URL.createObjectURL(croppedBlob);
        setPreviewUrl(objectUrl);
        setIsCropping(false);
        setIsDeleted(false);

        // 将 Blob 转换为 File 并塞回给隐藏的 input
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(new File([croppedBlob], "cover.webp", { type: "image/webp" }));
        if (inputRef.current) {
          inputRef.current.files = dataTransfer.files;
        }
      }
    } catch (e) {
      console.error(e);
      window.alert("图片裁剪失败！");
    }
  };

  const handleCancelCrop = () => {
    setImageSrc(null);
    setIsCropping(false);
    if (inputRef.current && (!previewUrl || previewUrl === defaultPreviewUrl)) {
      inputRef.current.value = "";
    }
  };

  const handleDeleteCover = () => {
    setPreviewUrl(null);
    setIsDeleted(true);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="w-full">
      {/* 隐藏的真实表单控件 */}
      <input
        ref={inputRef}
        accept="image/png,image/jpeg,image/webp"
        name="cover_image"
        type="file"
        className="hidden"
        onChange={handleFileChange}
      />
      
      {/* 标志着需要删除原有封面的隐藏字段 */}
      {isDeleted && <input type="hidden" name="clear_cover_image" value="on" />}

      {/* 外部展示按钮区 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {previewUrl ? (
          <div className="relative h-24 w-40 rounded-2xl overflow-hidden border border-slate-200/60 shadow-sm shrink-0 group">
            <img src={previewUrl} alt="Cover Preview" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-lg bg-white/20 hover:bg-white/40 text-white backdrop-blur px-3 py-1.5 text-xs font-bold transition-colors"
              >
                更换图片
              </button>
            </div>
          </div>
        ) : (
          <div className="flex h-24 w-40 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
            <ImageIcon className="h-6 w-6 opacity-50" />
            <span className="text-xs font-medium">无封面</span>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-10 w-fit items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 active:scale-95"
          >
            <UploadCloud className="h-4 w-4" />
            {previewUrl ? "重新选择并裁剪" : "选择图片并裁剪"}
          </button>
          
          {previewUrl && (
            <button
              type="button"
              onClick={handleDeleteCover}
              className="flex h-8 w-fit items-center gap-1.5 text-xs font-bold text-rose-500 hover:text-rose-600 transition-colors px-2"
            >
              <Trash2 className="h-3.5 w-3.5" /> 移除当前封面
            </button>
          )}

          <p className="mt-1 text-xs text-slate-400 max-w-sm">
            支持 PNG、JPG、WEBP，小于 10MB。系统将自动进行 16:9 的等比例裁剪，呈现最佳的展示效果。
          </p>
        </div>
      </div>

      {/* 悬浮裁剪弹窗 */}
      {isCropping && imageSrc && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900">调整封面展示区域</h3>
              <button type="button" onClick={handleCancelCrop} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* 裁剪区 (比例设定为 16:9 以适合卡片封面) */}
            <div className="relative h-[60vh] w-full bg-slate-900">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={16 / 9}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <div className="flex items-center gap-3 w-1/2">
                <span className="text-sm font-bold text-slate-500">缩放</span>
                <input
                  type="range"
                  value={zoom}
                  min={1}
                  max={3}
                  step={0.1}
                  aria-labelledby="Zoom"
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="h-1.5 w-full appearance-none rounded-full bg-slate-200 outline-none cursor-pointer [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-600 [&::-webkit-slider-thumb]:shadow-sm"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCancelCrop}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCrop}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white shadow-soft transition-all hover:bg-indigo-700 hover:shadow-floating active:scale-95"
                >
                  <Check className="h-4 w-4" />
                  确认裁剪
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
