import type { CartItem, CartTotals } from "@/types/cart";
import type { Address } from "@/types/user";

export type OrderStatus =
  | "pending" // placed, awaiting restaurant confirmation
  | "accepted" // confirmed with an ETA
  | "preparing"
  | "out_for_delivery"
  | "completed"
  | "cancelled";

export type OrderType = "delivery" | "pickup";

export type PaymentMethod = "cash" | "card_on_delivery";

/** Contact + delivery details captured at checkout. */
export interface OrderCustomer {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}

export interface Order {
  id: string;
  /** Human-friendly sequential number shown to staff, e.g. "#1042". */
  number: string;
  status: OrderStatus;
  type: OrderType;
  customer: OrderCustomer;
  address?: Address;
  items: CartItem[];
  totals: CartTotals;
  paymentMethod: PaymentMethod;
  /** Estimated prep/delivery time in minutes, set by the restaurant on accept. */
  etaMinutes?: number;
  customerNote?: string;
  /** Reason shown to the customer when cancelled. */
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
}
