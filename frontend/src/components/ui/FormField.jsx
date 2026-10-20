import { Children, cloneElement, isValidElement, useId } from "react";
import { cn } from "./cn";

/**
 * Label + control + hint/error as one unit, with the ids that tie them
 * together (label for, aria-describedby, aria-invalid) so a screen reader
 * announces the hint and the error with the field.
 *
 * The single child is cloned with id, aria-describedby and (when there is an
 * error) aria-invalid + error; a child that does not forward those still
 * renders, it just is not wired.
 */
export const FormField = ({ label, hint, error, required, optional, className, children }) => {
  const id = useId();
  const describedBy = error || hint ? `${id}-desc` : undefined;
  const control = Children.only(children);

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 flex items-baseline gap-1.5 text-xs font-medium text-text-secondary">
          {label}
          {required && (
            <span className="text-danger-500" aria-hidden="true">
              *
            </span>
          )}
          {optional && <span className="font-normal text-text-tertiary">Optional</span>}
        </label>
      )}
      {isValidElement(control)
        ? cloneElement(control, {
            id,
            "aria-describedby": describedBy,
            ...(error ? { "aria-invalid": true, error: true } : {}),
            ...(required ? { "aria-required": true } : {}),
          })
        : control}
      {(error || hint) && (
        <p id={describedBy} className={cn("mt-1.5 text-xs", error ? "text-danger-500" : "text-text-tertiary")}>
          {error || hint}
        </p>
      )}
    </div>
  );
};

export default FormField;
