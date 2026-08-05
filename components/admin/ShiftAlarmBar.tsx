"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { useShift } from "./ShiftProvider";

/** The board itself shows the orders; a bar pointing there would be noise. */
const LIVE_BOARD_PATH = "/admin/orders/live";

/**
 * What the siren looks like on the screens that are not the live board.
 *
 * The alarm now sounds anywhere in the admin panel, so wherever the staff are
 * standing they also need to see WHY it is screaming and how to get to the
 * order in one tap. A sound with nothing on screen is just a mystery noise.
 *
 * Pinned to the bottom rather than the top: on the kitchen tablet the top of
 * every admin screen is the nav bar, and covering that would hide the way out.
 */
export function ShiftAlarmBar() {
  const { hydrated, shiftStarted, audioBlocked, orders, unlockSound } = useShift();
  const pathname = usePathname();

  // The board handles its own presentation of all of this.
  if (!hydrated || pathname.startsWith(LIVE_BOARD_PATH)) return null;

  const pending = orders.length;

  // The mute warning outranks everything: the shift is running, an order could
  // arrive at any second, and the tablet would not make a sound.
  if (shiftStarted && audioBlocked) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4">
        <button
          type="button"
          onClick={unlockSound}
          className="w-full rounded-2xl border-2 border-red-500 bg-red-50 px-5 py-4 text-left shadow-xl"
        >
          <span className="block text-lg font-bold text-red-700">
            🔇 Звукът е спрян от браузъра
          </span>
          <span className="mt-1 block text-sm text-red-800">
            Смяната върви, но таблетът няма да звъни при нова поръчка. Натиснете
            тук, за да включите звука.
          </span>
          {pending > 0 && (
            <span className="mt-2 block font-bold text-red-900">
              Има {pending} чакащи{pending === 1 ? "а поръчка" : " поръчки"}!
            </span>
          )}
        </button>
      </div>
    );
  }

  if (pending === 0) return null;

  // Orders waiting with no shift started: no sound (the browser never gave us
  // permission), so the bar has to carry the message on its own.
  if (!shiftStarted) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4">
        <Link
          href={LIVE_BOARD_PATH}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-4 shadow-xl transition hover:bg-amber-100"
        >
          <span className="text-base font-bold text-amber-900 sm:text-lg">
            ⚠ {pending} чакащи{pending === 1 ? "а поръчка" : " поръчки"} · смяната не
            е започната
          </span>
          <span className="whitespace-nowrap rounded-full bg-amber-500 px-4 py-2 text-sm font-bold text-white">
            Отвори →
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4">
      <Link
        href={LIVE_BOARD_PATH}
        className="animate-pulse-bg flex flex-wrap items-center justify-between gap-3 rounded-2xl border-4 border-red-500 bg-white px-5 py-4 shadow-2xl"
      >
        <span className="text-lg font-extrabold text-red-700 sm:text-2xl">
          🔔 {pending} нов{pending === 1 ? "а поръчка" : "и поръчки"}!
        </span>
        <span className="whitespace-nowrap rounded-full bg-red-600 px-5 py-2.5 text-base font-bold text-white sm:text-lg">
          Отвори поръчките →
        </span>
      </Link>
    </div>
  );
}
