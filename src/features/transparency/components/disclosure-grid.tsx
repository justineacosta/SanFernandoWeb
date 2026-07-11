import { Construction, ReceiptText, Search, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { DocumentLink } from "@/components/shared/document-link";
import { BUDGET_DOCUMENTS, PROJECTS } from "@/features/transparency/data";

/** Bento grid of public disclosure categories: budgets, projects, financials, ordinances. */
export function DisclosureGrid() {
  return (
    <Section id="documents">
      <SectionHeading
        title="Public Disclosure Categories"
        description="Select a category to browse specific reports and ordinances."
      />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
        <Card className="rounded-3xl p-8 md:col-span-12 lg:col-span-8">
          <div className="mb-6 flex items-start justify-between">
            <span className="rounded-2xl bg-brand-100 p-4 text-ink-900">
              <Wallet className="h-9 w-9" aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold uppercase tracking-widest text-ink-900">
              Financial Oversight
            </span>
          </div>
          <h3 className="mb-4 text-2xl font-semibold">Annual Budget Reports</h3>
          <p className="mb-8 max-w-2xl text-ink-600">
            Complete breakdown of the Barangay&apos;s approved budgets for the current and previous
            fiscal years, including revenue sources and expenditure allocations.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {BUDGET_DOCUMENTS.map((title) => (
              <DocumentLink key={title} title={title} />
            ))}
          </div>
        </Card>

        <Card className="rounded-3xl p-8 md:col-span-6 lg:col-span-4">
          <span className="mb-6 inline-block rounded-2xl bg-brand-100 p-4 text-brand-700">
            <Construction className="h-9 w-9" aria-hidden="true" />
          </span>
          <h3 className="mb-4 text-2xl font-semibold">Project Monitoring</h3>
          <p className="mb-6 text-ink-600">
            Real-time status of local infrastructure and community welfare projects.
          </p>
          <ul className="space-y-4">
            {PROJECTS.map((project) => (
              <li key={project.name} className="flex items-center gap-3 text-sm">
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    project.progress === 100 ? "bg-green-500" : "bg-brand-500",
                  )}
                  aria-hidden="true"
                />
                <span>
                  {project.name} ({project.progress}%)
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="rounded-3xl p-8 md:col-span-6 lg:col-span-4">
          <span className="mb-6 inline-block rounded-2xl bg-danger-soft p-4 text-danger">
            <ReceiptText className="h-9 w-9" aria-hidden="true" />
          </span>
          <h3 className="mb-4 text-2xl font-semibold">Financial Statements</h3>
          <p className="mb-6 text-ink-600">
            Quarterly updates on income and expenses for public audit.
          </p>
          <Button variant="outline" className="w-full">
            View Archive
          </Button>
        </Card>

        <div className="relative overflow-hidden rounded-3xl bg-ink-900 p-8 text-white md:col-span-12 lg:col-span-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-brand-500/30 blur-3xl"
          />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <h3 className="mb-4 text-2xl font-semibold">Barangay Ordinances</h3>
              <p className="mb-8 max-w-xl text-ink-300">
                Searchable database of all passed resolutions and local laws that govern Barangay
                Sampaguita. Updated monthly for public awareness.
              </p>
            </div>
            <form className="flex flex-col items-center gap-4 md:flex-row" action="#">
              <div className="relative w-full">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-900"
                  aria-hidden="true"
                />
                <label htmlFor="ordinance-search" className="sr-only">
                  Search ordinances
                </label>
                <Input
                  id="ordinance-search"
                  type="search"
                  placeholder="Search by ordinance number or keyword..."
                  className="pl-12"
                />
              </div>
              <Button
                type="submit"
                variant="accent"
                size="lg"
                className="w-full whitespace-nowrap md:w-auto"
              >
                Search Database
              </Button>
            </form>
          </div>
        </div>
      </div>
    </Section>
  );
}
