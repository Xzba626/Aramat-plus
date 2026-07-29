import { cn } from "@/lib/utils";
import type { InputHTMLAttributes, ReactNode } from "react";
import { FieldLabel } from "@/components/ui/card";

export function FormField({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <FieldLabel>
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </FieldLabel>
      {children}
      {hint && !error ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

export function FormInput({
  error,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { error?: boolean }) {
  return (
    <input
      className={cn(error && "border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(220,38,38,0.2)]", className)}
      aria-invalid={error || undefined}
      {...props}
    />
  );
}
