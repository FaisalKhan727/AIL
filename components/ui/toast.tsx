"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant?: "default" | "success" | "error";
}

interface ToastContextValue {
  toast: (t: Omit<ToastItem, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((t: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 4500);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              "rounded-lg border bg-card text-card-foreground shadow-lg p-4",
              t.variant === "success" && "border-emerald-300",
              t.variant === "error" && "border-red-300",
            )}
          >
            <div className="font-medium text-sm">{t.title}</div>
            {t.description && <div className="text-sm text-muted-foreground mt-1">{t.description}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
