"use client";

import { useEffect, useState } from "react";

import type { HomeCarouselSlide } from "@/lib/api";

const fallbackSlides: HomeCarouselSlide[] = [
  { title: "KMS", subtitle: "Knowledge Management System", tone: "light" },
  { title: "DATA", subtitle: "Enterprise Knowledge Graph", tone: "middle" },
  { title: "RAG", subtitle: "Search And Question Answering", tone: "dark" }
].map((slide, index) => ({
  index: index + 1,
  title: slide.title,
  subtitle: slide.subtitle,
  image_url: null,
  has_image_upload: false,
}));

export function HomeCarousel({ slides }: { slides?: HomeCarouselSlide[] }) {
  const visibleSlides = slides && slides.length > 0 ? slides : fallbackSlides;
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentIndex((value) => (value + 1) % visibleSlides.length);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [visibleSlides.length]);

  useEffect(() => {
    if (currentIndex >= visibleSlides.length) {
      setCurrentIndex(0);
    }
  }, [currentIndex, visibleSlides.length]);

  return (
    <section className="kms-home-hero">
      <div className="kms-carousel-header" aria-live="polite">
        <span className="kms-slide-current">{String(currentIndex + 1).padStart(2, "0")}</span>
        <span className="kms-slide-total"> /{String(visibleSlides.length).padStart(2, "0")}//</span>
      </div>

      <div className="kms-home-visual" aria-label="首页轮播图">
        <div className="kms-carousel-track" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
          {visibleSlides.map((slide, index) => (
            <div
              className={`kms-carousel-slide kms-carousel-slide-${index === 0 ? "light" : index === 1 ? "middle" : "dark"} ${slide.image_url ? "has-image" : ""}`}
              key={slide.index}
            >
              {slide.image_url ? <img alt="" className="kms-carousel-image" src={slide.image_url} /> : null}
              <div className="kms-home-visual-grid" />
              <div className="kms-home-visual-core">
                <span>{slide.title}</span>
                <strong>{slide.subtitle}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="kms-carousel-footer">
        <div className="kms-footer-line" />
        <div className="kms-carousel-indicators" aria-label="轮播图分页">
          {visibleSlides.map((slide, index) => (
            <button
              aria-label={`切换到第 ${index + 1} 张轮播图`}
              className={index === currentIndex ? "active" : undefined}
              key={slide.index}
              onClick={() => setCurrentIndex(index)}
              type="button"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
