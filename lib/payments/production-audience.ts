/**
 * Who is offered REAL card payment — SERVER ONLY.
 *
 * One switch, kept in the database and flipped from Admin → Settings
 * ("Реално плащане с карта — достъпно за всички клиенти"):
 *
 *   everyone   guests and customers see "Плащане онлайн с карта" and go to
 *              the bank's real (production) page
 *   staff      only signed-in staff see it (the controlled pilot)
 *   null       never set — the server's PAYMENT_PRODUCTION_AUDIENCE applies
 *
 * The stored value REPLACES the environment variable (getPaymentConfig's
 * `productionAudience` override), so the admin control is never a button
 * whose value is silently ignored. It decides only WHO is offered the card:
 * the terminal, keys, currency and every check of the bank's confirmations
 * still come from the server's configuration, and a site without a valid
 * production terminal offers no card whatever is stored here. It never
 * touches the demo simulator, which production keeps away from the public.
 *
 * The read shares the restaurant-settings cache entry's tag, so a save
 * (revalidateTag) updates the footer and legal pages at once.
 */
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { SETTINGS_CACHE_TAG, SETTINGS_ROW_ID } from "@/lib/restaurant-settings";
import { isProductionAudience, type ProductionAudience } from "./config";

async function readStored(): Promise<ProductionAudience | null> {
  const row = await db.restaurantSettings.findUnique({
    where: { id: SETTINGS_ROW_ID },
    select: { cardProductionAudience: true },
  });
  return isProductionAudience(row?.cardProductionAudience) ? row.cardProductionAudience : null;
}

const readCached = unstable_cache(readStored, ["card-production-audience"], {
  tags: [SETTINGS_CACHE_TAG],
  revalidate: 300,
});

/**
 * The stored audience, or null (not set / unreadable → the env applies).
 * `fresh` skips the cache: the admin page and the save action read the truth.
 */
export async function getStoredProductionAudience(
  options: { fresh?: boolean } = {}
): Promise<ProductionAudience | null> {
  try {
    if (!options.fresh) {
      try {
        return await readCached();
      } catch {
        // Outside a Next.js request (scripts, tests) there is no cache.
      }
    }
    return await readStored();
  } catch (err) {
    console.warn(`[payments] stored card audience unreadable: ${(err as Error).message}`);
    return null;
  }
}

export async function setStoredProductionAudience(audience: ProductionAudience | null): Promise<void> {
  await db.restaurantSettings.update({
    where: { id: SETTINGS_ROW_ID },
    data: { cardProductionAudience: audience },
  });
}
