import type { ServiceFlow } from "@/types";

/**
 * The public route a service card's CTA points at.
 *
 * The parameter is structural rather than `Pick<Service, "id" | "flow">`: a
 * `Pick` would make this module depend on `Service.flow`, which Task 3 adds.
 * A `ServiceRecord` satisfies this shape once that lands.
 *
 * The `switch` is exhaustive over `ServiceFlow` with no `default`, so adding a
 * fifth flow to the union without adding its route here is a compile error
 * rather than a silent fallthrough to the apply page.
 */
export function serviceHref(service: { id: string; flow: ServiceFlow }): string {
  switch (service.flow) {
    case "complaint":
      return "/complaints/new";
    case "assistance":
      return "/assistance/new";
    case "appointment":
      return "/appointments/new";
    case "apply":
      return `/services/apply/${service.id}`;
  }
}
