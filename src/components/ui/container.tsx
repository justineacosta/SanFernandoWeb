import { cn } from "@/lib/utils";

type ContainerProps = React.HTMLAttributes<HTMLDivElement>;

/** Centered 1280px page container with responsive gutters. */
export function Container({ className, ...props }: ContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full max-w-(--container-page) px-4 md:px-8", className)}
      {...props}
    />
  );
}
