import type { PublicAchievement } from "@/types";
import { PhotoGallery } from "@/components/shared/photo-gallery";

interface AchievementsTimelineProps {
  achievements: PublicAchievement[];
}

/** Vertical timeline of an official's published achievements. */
export function AchievementsTimeline({ achievements }: AchievementsTimelineProps) {
  if (achievements.length === 0) return null;

  return (
    <div className="mt-12 max-w-3xl">
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink-900">
        Achievements
      </h2>
      <ol className="mt-6 space-y-8 border-l border-ink-200/70 pl-8">
        {achievements.map((achievement) => (
          <li key={achievement.id} className="relative">
            {/* Sits on the rail: -(32px padding + 1px border) - half the dot. */}
            <span
              aria-hidden="true"
              className="absolute -left-[38.5px] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-500"
            />
            {achievement.dateLabel ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                {achievement.dateLabel}
              </p>
            ) : null}
            <h3 className="mt-1 font-display text-lg font-semibold tracking-tight text-ink-900">
              {achievement.title}
            </h3>
            {achievement.description ? (
              <p className="mt-2 whitespace-pre-line leading-relaxed text-ink-600">
                {achievement.description}
              </p>
            ) : null}
            {achievement.photos.length > 0 ? (
              <div className="mt-4">
                <PhotoGallery photos={achievement.photos} variant="thumbs" />
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
