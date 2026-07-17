import { cn } from "@/lib/utils";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

interface BadgeProps {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}

const tones: Record<Tone, string> = {
  neutral: "bg-neutral-100 text-neutral-700",
  success: "bg-green-100 text-green-800",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-800",
  info: "bg-blue-100 text-blue-800",
};

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
