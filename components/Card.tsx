import { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-sm border border-cellar-border bg-white p-5 ${className}`}
      {...props}
    />
  );
}
