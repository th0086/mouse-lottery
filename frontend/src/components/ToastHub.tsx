"use client";

import { useEffect, useState } from "react";

type ToastItem = {
  id: number;
  message: string;
  type: "info" | "warning" | "error";
};

export function ToastHub() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string; type?: "info" | "warning" | "error" }>;
      const message = customEvent.detail?.message;
      if (!message) {
        return;
      }

      const id = Date.now() + Math.floor(Math.random() * 1000);
      const type = customEvent.detail?.type ?? "info";
      setToasts((current) => [...current, { id, message, type }]);

      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 3800);
    };

    window.addEventListener("app-toast", onToast);
    return () => window.removeEventListener("app-toast", onToast);
  }, []);

  return (
    <div className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
