import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DeliveryDetailsForm } from "./DeliveryDetailsForm";

/**
 * Checkout form (placeholder). Stage 4 wires contact + delivery details,
 * validation, and order submission via /api/orders.
 */
export function CheckoutForm() {
  const t = useTranslations("checkout");

  return (
    <form className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-pizza-ink">
          {t("contactDetails")}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label={t("firstName")} name="firstName" />
          <Input label={t("lastName")} name="lastName" />
          <Input label={t("phone")} name="phone" />
          <Input label={t("email")} name="email" type="email" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-pizza-ink">{t("delivery")}</h2>
        <DeliveryDetailsForm />
      </section>

      <Button type="button" disabled>
        {t("submit")}
      </Button>
    </form>
  );
}
