import { upcReturnHandler } from "@/lib/payments/upc/return-route";

/** FAILURE_URL for ОББ's UPC terminal (portal → Terminals → MerchantID → TerminalID). */
export const dynamic = "force-dynamic";

const handle = upcReturnHandler("failure");
export const GET = handle;
export const POST = handle;
