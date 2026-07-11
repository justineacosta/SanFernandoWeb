import Image from "next/image";
import { ArrowRight, Quote } from "lucide-react";
import { Section } from "@/components/ui/section";
import { CAPTAIN } from "@/features/about/data";

/** Portrait and bilingual message from the Punong Barangay. */
export function CaptainMessageSection() {
  return (
    <Section tone="raised" className="py-16 md:py-24">
      <div className="flex flex-col items-center gap-16 md:flex-row">
        <div className="relative w-full md:w-1/3">
          <div className="aspect-4/5 overflow-hidden rounded-xl border-8 border-white shadow-lg">
            <Image
              src={CAPTAIN.photo}
              alt={CAPTAIN.photoAlt}
              width={480}
              height={600}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="absolute -bottom-6 -right-6 rounded-lg bg-primary p-6 text-white shadow-xl">
            <p className="text-xl font-semibold">{CAPTAIN.name}</p>
            <p className="text-sm uppercase tracking-wider opacity-80">{CAPTAIN.role}</p>
          </div>
        </div>
        <div className="w-full md:w-2/3">
          <Quote className="mb-4 h-14 w-14 text-line" aria-hidden="true" />
          <h2 className="mb-6 text-2xl font-semibold text-primary">
            A Message from the Punong Barangay
          </h2>
          <div className="space-y-4 text-lg italic leading-relaxed text-ink-muted">
            {CAPTAIN.message.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="mt-8 border-t border-line pt-8">
            <a
              href="#"
              className="inline-flex items-center gap-2 font-bold text-primary hover:underline"
            >
              View Executive Agenda 2024-2027
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </Section>
  );
}
