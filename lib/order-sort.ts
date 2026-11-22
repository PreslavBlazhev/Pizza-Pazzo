/**
 * Newest order first: `createdAt` DESC, then `orderNumber` DESC, then `id`.
 *
 * The live board's "В процес" list uses this so the order that just came in
 * is always on top (#1085 above #1084). Staff were re-printing orders because
 * new ones landed at the bottom of the list.
 *
 * The creation time decides, NOT when the order was accepted or last
 * changed: an older order accepted after a newer one still sits below it.
 * `orderNumber` breaks ties (it is assigned max+1 at checkout, so it follows
 * creation), and `id` keeps the order fully deterministic.
 *
 * Pure and non-mutating: it returns a new array, so it is safe on React state.
 */
export interface SortableOrder {
  id: string;
  orderNumber: number;
  createdAt: string | Date;
}

function time(value: string | Date): number {
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

export function compareNewestFirst(a: SortableOrder, b: SortableOrder): number {
  return (
    time(b.createdAt) - time(a.createdAt) ||
    b.orderNumber - a.orderNumber ||
    (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
}

export function sortNewestFirst<T extends SortableOrder>(orders: readonly T[]): T[] {
  return [...orders].sort(compareNewestFirst);
}
