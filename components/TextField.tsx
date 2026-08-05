import { InputHTMLAttributes, useId } from "react";

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({
  label,
  error,
  hint,
  id,
  className = "",
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-sm font-medium text-cellar-text">
        {label}
      </label>
      <input
        id={fieldId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`rounded-sm border bg-white px-3 py-2 text-base text-cellar-text placeholder:text-cellar-text/40 focus:outline-none focus:ring-2 focus:ring-cellar-gold ${
          error ? "border-cellar-danger" : "border-cellar-border"
        } ${className}`}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-xs text-cellar-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-cellar-danger">
          {error}
        </p>
      )}
    </div>
  );
}
