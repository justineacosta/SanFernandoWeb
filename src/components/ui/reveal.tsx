"use client";

import { useEffect, useRef } from "react";

interface RevealProps {
  children: React.ReactNode;
  /** Stagger offset in ms, for card grids. */
  delay?: number;
  className?: string;
}

/**
 * Scroll-reveal wrapper (overhaul spec §5 pattern 2). Renders children
 * visible in the server HTML — no-JS users and crawlers never see hidden
 * content. On mount, anything still below the fold is set to
 * `reveal-pending` (invisible anyway because it is off-screen, so hiding
 * after paint cannot flash) and observed; on first intersection it gets
 * `reveal-in` and the observer disconnects. Content already in the viewport
 * at load is left alone — no entrance animation on the first screenful.
 *
 * Public pages only. The admin portal deliberately gets no scroll reveals.
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.classList.add("reveal-pending");
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        el.classList.add("reveal-in");
        observer.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
