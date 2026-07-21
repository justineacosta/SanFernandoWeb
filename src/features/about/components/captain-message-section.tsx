import Image from "next/image";
import { Quote } from "lucide-react";
import { Section } from "@/components/ui/section";
import { CAPTAIN } from "@/features/about/data";
import { getPublishedExecutiveOfficial } from "@/features/officials/queries";

/**
 * Portrait and bilingual message from the Punong Barangay. Name, role, and
 * portrait come from the officials table (kept in sync by /admin/officials)
 * so an election only has to be recorded once; they fall back to the static
 * CAPTAIN values if that query returns null. The quoted message itself has
 * no DB counterpart and is always static — see CAPTAIN.message.
 */
export async function CaptainMessageSection() {
  const executive = await getPublishedExecutiveOfficial();
  const name = executive?.name ?? CAPTAIN.name;
  const role = executive?.role ?? CAPTAIN.role;
  const photoSrc = executive?.photoUrl ?? CAPTAIN.photo;
  const photoAlt = executive?.photoAlt ?? CAPTAIN.photoAlt;

  return (
    <Section tone="raised" className="py-16 md:py-24">
      <div className="flex flex-col items-center gap-16 md:flex-row">
        <div className="relative w-full md:w-1/3">
          <div className="aspect-4/5 overflow-hidden rounded-[2rem] border border-ink-200/70 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.3)]">
            <Image
              src={photoSrc}
              alt={photoAlt}
              width={480}
              height={600}
              className="h-full w-full object-cover"
            />
          </div>
          {/*
            The card overhangs the portrait at md+, where the column is w-1/3 and
            the row absorbs it. At mobile the column is full width, so -right-6
            (24px) against Container's px-4 (16px) pushed the page 8px wide and
            let it drag sideways — hence right-0 below the breakpoint.
          */}
          <div className="absolute -bottom-6 right-0 rounded-2xl bg-ink-900 p-6 text-white shadow-xl md:-right-6">
            <p className="text-xl font-semibold">{name}</p>
            <p className="text-sm uppercase tracking-wider opacity-80">{role}</p>
          </div>
        </div>
        <div className="w-full md:w-2/3">
          <Quote className="mb-4 h-14 w-14 text-ink-300" aria-hidden="true" />
          <h2 className="mb-6 text-2xl font-semibold tracking-tight text-ink-900">
            A Message from the Punong Barangay
          </h2>
          <div className="space-y-4 text-lg italic leading-relaxed text-ink-700">
            {CAPTAIN.message.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
