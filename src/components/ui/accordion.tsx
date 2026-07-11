"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDisclosure } from "@/hooks/use-disclosure";

interface AccordionProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  triggerClassName?: string;
  className?: string;
}

/** Accessible disclosure widget used for expandable content such as service requirements. */
export function Accordion({ trigger, children, triggerClassName, className }: AccordionProps) {
  const { isOpen, toggle } = useDisclosure();
  const panelId = useId();

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={cn(
          "flex w-full items-center justify-between gap-2 text-left font-display text-sm font-semibold tracking-tight",
          triggerClassName,
        )}
      >
        {trigger}
        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-brand-500 transition-transform duration-300", isOpen && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <div
        id={panelId}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="pt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
