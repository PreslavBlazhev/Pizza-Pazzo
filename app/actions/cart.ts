"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { isAddonOnlyCategory } from "@/lib/extras-rules";

const idsSchema = z.array(z.string().min(1).max(120)).max(50);

/**
 * Which of these basket products can no longer be ordered — taken off sale
 * in the admin (isAvailable = false) or gone from the menu altogether. A
 * basket lives in the browser for weeks; this lets the basket and the
 * checkout name the line instead of the order being refused at the very end.
 * placeOrder still refuses such a product on its own (PRODUCT_UNAVAILABLE).
 */
export async function unavailableCartProducts(rawIds: unknown): Promise<string[]> {
  const parsed = idsSchema.safeParse(rawIds);
  if (!parsed.success) return [];
  const ids = [...new Set(parsed.data)];
  if (ids.length === 0) return [];
  const rows = await db.menuProduct.findMany({
    where: { id: { in: ids } },
    select: { id: true, isAvailable: true, categoryId: true },
  });
  // A topping / burger add-on is never on sale on its own (it is ordered
  // only on a pizza or a burger), whatever its availability switch says.
  const onSale = new Set(
    rows.filter((r) => r.isAvailable && !isAddonOnlyCategory(r.categoryId)).map((r) => r.id)
  );
  return ids.filter((id) => !onSale.has(id));
}
