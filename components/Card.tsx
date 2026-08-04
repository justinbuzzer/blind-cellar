import { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-cellar-border bg-white p-5 shadow-sm ${className}`}
      {...props}
    />
  );
}
