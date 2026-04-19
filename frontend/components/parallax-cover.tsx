"use client";

import { useRef, useState, CSSProperties, ReactNode } from "react";

type ParallaxCoverProps = {
  coverUrl?: string;
  fallbackClass: string;
  children?: ReactNode;
  className?: string;
};

export function ParallaxCover({ coverUrl, fallbackClass, children, className = "" }: ParallaxCoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    
    // 计算鼠标相对于卡片中心的相对位置 (-1 到 1 之间)
    const x = (e.clientX - left - width / 2) / (width / 2);
    const y = (e.clientY - top - height / 2) / (height / 2);

    setOffset({ x, y });
  };

  const handleMouseLeave = () => {
    setOffset({ x: 0, y: 0 });
  };

  const style: CSSProperties = coverUrl
    ? {
        backgroundImage: `url("${coverUrl}")`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        // 基于鼠标移动施加一个轻微的反向位移，产生 3D 纵深视差效果
        transform: `scale(1.1) translate3d(${offset.x * -10}px, ${offset.y * -10}px, 0)`,
        transition: "transform 0.15s ease-out",
      }
    : {
        transform: `scale(1.1) translate3d(${offset.x * -8}px, ${offset.y * -8}px, 0)`,
        transition: "transform 0.15s ease-out",
      };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden cursor-pointer group ${className}`}
    >
      {/* 视差背景层 */}
      <div
        className={`absolute inset-[-15%] w-[130%] h-[130%] ${!coverUrl ? fallbackClass : ""} z-0`}
        style={style}
      />
      
      {/* 渐变遮罩层：从上到下逐渐加深，确保白色文字的对比度，而不突兀 */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/20 via-slate-950/60 to-slate-950/90 pointer-events-none transition-opacity duration-300 group-hover:from-slate-950/40 group-hover:via-slate-950/70 group-hover:to-slate-950/95" />

      {/* 内容层 */}
      <div className="relative z-10 h-full w-full">
        {children}
      </div>
    </div>
  );
}
