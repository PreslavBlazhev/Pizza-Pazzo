import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { DeliveryDetailsForm } from "./DeliveryDetailsForm";

/**
 * Checkout form (placeholder). Stage 4 wires contact + delivery details,
 * validation, and order submission via /api/orders.
 */
export function CheckoutForm() {
  return (
    <form className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-800">Контакти</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Име" name="firstName" />
          <Input label="Фамилия" name="lastName" />
          <Input label="Телефон" name="phone" />
          <Input label="Имейл" name="email" type="email" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-neutral-800">Доставка</h2>
        <DeliveryDetailsForm />
      </section>

      <Button type="button" disabled>
        Завърши поръчката (Stage 4)
      </Button>
    </form>
  );
}
