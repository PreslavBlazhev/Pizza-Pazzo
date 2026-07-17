import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "bg-accent text-neutral-900 hover:brightness-95",
  outline: "border border-neutral-300 text-neutral-800 hover:bg-neutral-100",
  ghost: "text-neutral-700 hover:bg-neutral-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
