import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getOrderById } from "@/lib/orders";
import { getPrintTemplate } from "@/lib/print-templates";
import { buildPrintableOrderJson } from "@/lib/android-printer";
import { printTemplateIdFromParam } from "@/types/print";

/**
 * GET /api/admin/orders/:id/printable?t=kitchen|delivery&reprint=1 — the
 * Android print job for one order, built on the server from the order as it
 * is NOW. Staff+.
 *
 * Every print and reprint from the app goes through here, so the server
 * decides: an order that expired at 22:30 (lib/db.ts) answers 410 and nothing
 * is printed, even if a tablet still shows it from before the cutoff.
 * no-store: the job carries a customer's name, phone and address.
 */
export const dynamic = "force-dynamic";

const ALLOWED = ["STAFF", "ADMIN", "SUPER_ADMIN"];
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !ALLOWED.includes(user.role)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }
  const { id } = await params;
  const url = new URL(request.url);
  const [order, template] = await Promise.all([
    getOrderById(id),
    getPrintTemplate(printTemplateIdFromParam(url.searchParams.get("t") ?? undefined)),
  ]);
  if (!order || !order.items) {
    return NextResponse.json({ error: "expired" }, { status: 410, headers: NO_STORE });
  }
  const json = buildPrintableOrderJson(
    { ...order, items: order.items },
    { isReprint: url.searchParams.get("reprint") === "1", template }
  );
  return NextResponse.json({ json }, { headers: NO_STORE });
}
