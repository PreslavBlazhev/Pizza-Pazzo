import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

/** Delivery address fields (placeholder — validation/state in Stage 4). */
export function DeliveryDetailsForm() {
  const t = useTranslations("checkout");

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Input label={t("street")} name="street" placeholder={t("streetPlaceholder")} />
      <Input label={t("number")} name="number" placeholder="12" />
      <Input label={t("entrance")} name="entrance" placeholder="А" />
      <Input label={t("floor")} name="floor" placeholder="3" />
      <Input label={t("apartment")} name="apartment" placeholder="9" />
      <Input label={t("city")} name="city" placeholder={t("cityPlaceholder")} />
      <div className="sm:col-span-2">
        <Textarea label={t("notes")} name="note" placeholder={t("notesPlaceholder")} />
      </div>
    </div>
  );
}
