import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { SITE } from "@/constants/site";
import { Container } from "@/components/ui/container";

const items = [
  { icon: MapPin, text: SITE.address },
  { icon: Clock, text: SITE.officeHours },
  { icon: Phone, text: SITE.phone },
  { icon: Mail, text: SITE.email },
];

/** Slim utility strip above the header with address, hours, and contact details. */
export function TopBar() {
  return (
    <div className="bg-primary-strong py-2 text-sm text-white">
      <Container className="flex flex-col items-center justify-between gap-2 sm:flex-row">
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-6">
          {items.slice(0, 2).map(({ icon: Icon, text }) => (
            <span key={text} className="flex items-center gap-2">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {text}
            </span>
          ))}
        </div>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-6">
          {items.slice(2).map(({ icon: Icon, text }) => (
            <span key={text} className="flex items-center gap-2">
              <Icon className="h-4 w-4" aria-hidden="true" />
              {text}
            </span>
          ))}
        </div>
      </Container>
    </div>
  );
}
