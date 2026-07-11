import Image from "next/image";
import { ArrowRight, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { NewsArticle } from "@/types";

interface NewsCardProps {
  article: NewsArticle;
}

/** Featured article card: side-by-side image and copy with author byline. */
export function FeaturedNewsCard({ article }: NewsCardProps) {
  return (
    <article className="group overflow-hidden rounded-xl border border-line bg-white transition-all duration-300 hover:shadow-lg">
      <div className="grid md:grid-cols-2">
        <div className="relative h-64 overflow-hidden md:h-full">
          <Image
            src={article.image}
            alt={article.imageAlt}
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <Badge variant="accent" className="absolute left-4 top-4 bg-primary">
            Featured
          </Badge>
        </div>
        <div className="flex flex-col justify-center p-8">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-secondary">
            {article.category}
          </p>
          <h3 className="mb-4 text-2xl font-semibold transition-colors group-hover:text-primary">
            {article.title}
          </h3>
          <p className="mb-6 line-clamp-3 text-ink-muted">{article.excerpt}</p>
          <div className="mt-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-mid">
                <User className="h-5 w-5 text-primary" aria-hidden="true" />
              </span>
              <span className="flex flex-col">
                <span className="text-sm font-semibold">{article.author}</span>
                <span className="text-xs text-ink-muted">{article.dateLabel}</span>
              </span>
            </div>
            <a
              href="#"
              className="flex items-center gap-1 text-sm font-semibold uppercase text-primary transition-all hover:gap-2"
            >
              Read More <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Standard news grid card with image, category, and excerpt. */
export function NewsCard({ article }: NewsCardProps) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-line bg-white transition-colors hover:border-primary">
      <div className="relative h-48 overflow-hidden">
        <Image
          src={article.image}
          alt={article.imageAlt}
          fill
          sizes="(min-width: 768px) 33vw, 100vw"
          className="object-cover"
        />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-secondary">
          {article.category}
        </p>
        <h3 className="mb-3 text-xl font-semibold">{article.title}</h3>
        <p className="mb-4 line-clamp-2 text-sm text-ink-muted">{article.excerpt}</p>
        <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
          <span className="text-xs text-ink-muted">{article.dateLabel}</span>
          <a href="#" className="text-sm font-semibold uppercase text-primary hover:underline">
            Details
          </a>
        </div>
      </div>
    </article>
  );
}
