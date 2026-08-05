import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-cellar-maroon text-white hover:bg-cellar-maroon-dark disabled:bg-cellar-maroon/50",
  secondary:
    "bg-transparent text-cellar-maroon border border-cellar-maroon hover:bg-cellar-maroon/5 disabled:opacity-50",
  ghost:
    "bg-transparent text-cellar-text hover:bg-cellar-text/5 disabled:opacity-50",
  danger:
    "bg-transparent text-cellar-danger border border-cellar-danger hover:bg-cellar-danger/5 disabled:opacity-50",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", fullWidth, className = "", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex min-h-[44px] items-center justify-center rounded-sm px-5 py-3 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold disabled:cursor-not-allowed ${
          VARIANT_CLASSES[variant]
        } ${fullWidth ? "w-full" : ""} ${className}`}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
