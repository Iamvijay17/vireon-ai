import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";
import { cn } from "./cn";

/**
 * Icon-only copy-to-clipboard button. Swaps to a checkmark for a beat after
 * a successful copy so the click has visible feedback, then reverts.
 */
export const CopyButton = ({ value, label = "Copy", size = "xs", variant = "ghost", className }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    const text = typeof value === "function" ? value() : value;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied or unavailable - nothing sensible to
      // recover into here, silently no-op rather than throw in the UI.
    }
  };

  return (
    <Tooltip content={copied ? "Copied!" : label}>
      <Button
        type="button"
        variant={variant}
        size={size}
        iconOnly
        aria-label={copied ? "Copied" : label}
        onClick={handleCopy}
        icon={copied ? <Check className="size-3.5 text-success-500" /> : <Copy className="size-3.5" />}
        className={cn("shrink-0", className)}
      />
    </Tooltip>
  );
};

export default CopyButton;
