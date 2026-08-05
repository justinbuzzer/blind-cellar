import { ReactNode, useEffect, useRef } from "react";

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function Modal({ title, children, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-cellar-maroon-dark/40 p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-sm border border-cellar-border bg-white p-6 focus:outline-none"
      >
        <h2 id="modal-title" className="font-display text-xl font-semibold text-cellar-maroon-dark">
          {title}
        </h2>
        <div className="mt-3 text-sm text-cellar-text">{children}</div>
      </div>
    </div>
  );
}
