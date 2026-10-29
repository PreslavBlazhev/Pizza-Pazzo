import { upcReturnHandler } from "@/lib/payments/upc/return-route";

/** SUCCESS_URL for ОББ's UPC terminal (portal → Terminals → MerchantID → TerminalID). */
export const dynamic = "force-dynamic";

const handle = upcReturnHandler("success");
export const GET = handle;
export const POST = handle;
