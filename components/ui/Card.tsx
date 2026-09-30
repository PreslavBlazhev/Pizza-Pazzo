import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** Anchor target, e.g. /contacts#complaints. */
  id?: string;
}

export function Card({ children, className, id }: CardProps) {
  return (
    <div
      id={id}
      className={cn(
        "rounded-lg border border-neutral-200 bg-white p-4 shadow-sm",
        className
      )}
    >
      {children}
    </div>
  );
}
