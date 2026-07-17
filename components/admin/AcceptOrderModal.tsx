"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ETA_PRESETS } from "@/lib/constants";

interface AcceptOrderModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm?: (etaMinutes: number) => void;
}

/**
 * Modal to accept an order and pick an ETA (placeholder).
 * Confirm handler is wired to the orders store/API in Stage 5.
 */
export function AcceptOrderModal({ open, onClose, onConfirm }: AcceptOrderModalProps) {
  const [eta, setEta] = useState<number>(ETA_PRESETS[1]);

  return (
    <Modal open={open} onClose={onClose} title="Приемане на поръчка">
      <p className="mb-3 text-sm text-neutral-600">Изберете ориентировъчно време:</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {ETA_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => setEta(preset)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              eta === preset ? "bg-brand text-white" : "bg-neutral-100 text-neutral-700"
            }`}
          >
            {preset} мин
          </button>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Отказ
        </Button>
        <Button onClick={() => onConfirm?.(eta)}>Приеми</Button>
      </div>
    </Modal>
  );
}
