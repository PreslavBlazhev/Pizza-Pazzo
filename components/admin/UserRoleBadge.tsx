import { ROLE_LABELS, type UserRole } from "@/types/auth";
import { cn } from "@/lib/utils";

/** Colour-coded role chip. Used in the admin users table and on /profile. */
export function UserRoleBadge({
  role,
  className,
}: {
  role: UserRole;
  className?: string;
}) {
  const tones: Record<UserRole, string> = {
    customer: "bg-pizza-cream-dark/60 text-pizza-ink",
    staff: "bg-blue-100 text-blue-800",
    admin: "bg-pizza-green-light text-pizza-green-dark",
    super_admin: "bg-pizza-red-light text-brand-dark",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tones[role],
        className
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
