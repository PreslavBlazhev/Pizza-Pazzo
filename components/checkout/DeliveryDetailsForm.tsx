import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

/** Delivery address fields (placeholder — validation/state in Stage 4). */
export function DeliveryDetailsForm() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Input label="Улица" name="street" placeholder="ул. Витоша" />
      <Input label="Номер" name="number" placeholder="12" />
      <Input label="Вход" name="entrance" placeholder="А" />
      <Input label="Етаж" name="floor" placeholder="3" />
      <Input label="Апартамент" name="apartment" placeholder="9" />
      <Input label="Град" name="city" placeholder="София" />
      <div className="sm:col-span-2">
        <Textarea label="Бележка към доставката" name="note" />
      </div>
    </div>
  );
}
