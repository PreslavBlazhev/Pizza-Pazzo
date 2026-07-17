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
    CUSTOMER: "bg-pizza-cream-dark/60 text-pizza-ink",
    STAFF: "bg-blue-100 text-blue-800",
    ADMIN: "bg-pizza-green-light text-pizza-green-dark",
    SUPER_ADMIN: "bg-pizza-red-light text-brand-dark",
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
