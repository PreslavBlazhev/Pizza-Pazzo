"use server";

import { z } from "zod";
import { db } from "@/lib/db";

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
    select: { id: true, isAvailable: true },
  });
  const onSale = new Set(rows.filter((r) => r.isAvailable).map((r) => r.id));
  return ids.filter((id) => !onSale.has(id));
}
