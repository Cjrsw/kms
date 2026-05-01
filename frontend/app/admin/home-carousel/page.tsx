import { ImageIcon } from "lucide-react";

import {
  AdminCard,
  AdminFieldLabel,
  AdminInput,
  AdminPageSection,
  AdminPrimaryButton,
  AdminTextarea,
} from "../../../components/admin-ui";
import { RepositoryCoverInput } from "../../../components/repository-cover-input";
import { getAdminHomeAnnouncement, getAdminHomeCarousel } from "../../../lib/api";

export default async function AdminHomeCarouselPage() {
  const [carousel, announcement] = await Promise.all([getAdminHomeCarousel(), getAdminHomeAnnouncement()]);

  return (
    <div className="mx-auto max-w-6xl">
      <AdminPageSection
        eyebrow="Content"
        title="首页配置"
        description="配置用户侧首页左侧轮播图与右侧公告牌。"
      />

      <AdminCard className="mb-5 overflow-hidden">
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            首页公告
          </div>
          <p className="mt-1 text-xs text-slate-500">公告会显示在用户侧首页右侧“公告”页签。</p>
        </div>
        <form action="/api/admin/home-announcement/save" className="grid gap-5 p-5" method="POST">
          <input name="return_path" type="hidden" value="/admin/home-carousel" />
          <div>
            <AdminFieldLabel>公告标题</AdminFieldLabel>
            <AdminInput defaultValue={announcement.title} maxLength={80} name="title" placeholder="如：系统告示" />
          </div>
          <div>
            <AdminFieldLabel>公告内容</AdminFieldLabel>
            <AdminTextarea
              defaultValue={announcement.content}
              maxLength={1000}
              name="content"
              placeholder="输入首页告示内容"
              rows={5}
            />
          </div>
          <div className="flex justify-end border-t border-slate-100 pt-5">
            <AdminPrimaryButton type="submit">保存公告</AdminPrimaryButton>
          </div>
        </form>
      </AdminCard>

      <div className="grid gap-5 lg:grid-cols-3">
        {carousel.slides.map((slide) => (
          <AdminCard className="overflow-hidden" key={slide.index}>
            <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <ImageIcon className="h-4 w-4 text-indigo-500" />
                轮播图 {String(slide.index).padStart(2, "0")}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {slide.has_image_upload ? "已配置自定义图片" : "未配置图片时使用默认动画背景"}
              </p>
            </div>

            <form action="/api/admin/home-carousel/save" className="space-y-5 p-5" encType="multipart/form-data" method="POST">
              <input name="slide_index" type="hidden" value={slide.index} />
              <input name="return_path" type="hidden" value="/admin/home-carousel" />

              <div>
                <AdminFieldLabel>主标题</AdminFieldLabel>
                <AdminInput defaultValue={slide.title} name="title" placeholder="如：KMS" required />
              </div>

              <div>
                <AdminFieldLabel>副标题</AdminFieldLabel>
                <AdminInput defaultValue={slide.subtitle} name="subtitle" placeholder="如：Knowledge Management System" required />
              </div>

              <div>
                <AdminFieldLabel>轮播图片</AdminFieldLabel>
                <RepositoryCoverInput
                  clearName="clear_image"
                  defaultPreviewUrl={slide.image_url}
                  emptyLabel="默认背景"
                  inputName="image"
                />
              </div>

              <div className="border-t border-slate-100 pt-5">
                <AdminPrimaryButton className="w-full" type="submit">
                  保存轮播图 {String(slide.index).padStart(2, "0")}
                </AdminPrimaryButton>
              </div>
            </form>
          </AdminCard>
        ))}
      </div>
    </div>
  );
}
