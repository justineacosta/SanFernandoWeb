import { Leaf, Recycle } from "lucide-react";
import type { WasteCollectionSlot } from "@/types";

export const WASTE_SCHEDULE: {
  title: string;
  description: string;
  slots: WasteCollectionSlot[];
} = {
  title: "Waste Collection Schedule",
  description:
    "Garbage segregation is mandatory for all households. Set out the right bags on collection days for the municipal garbage truck.",
  slots: [
    {
      label: "Perishable & biodegradable waste",
      days: "Wednesday & Sunday",
      note: "Collected in the morning",
      icon: Leaf,
    },
    {
      label: "Non-perishable & residual waste",
      days: "Friday",
      note: "Keep separate from biodegradables",
      icon: Recycle,
    },
  ],
};
