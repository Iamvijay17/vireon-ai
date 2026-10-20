import { RotateCw } from "lucide-react";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";

/**
 * Persistent error block (as opposed to a transient toast) for a failure the
 * user has to act on, with an optional Retry. Say what failed and, when it is
 * known, why - `description` is for the server's own message.
 */
const ErrorState = ({ message = "Something went wrong", description, onRetry, retryLabel = "Retry", className }) => (
  <Alert
    type="error"
    title={message}
    className={className}
    action={
      onRetry && (
        <Button size="sm" variant="secondary" icon={<RotateCw className="size-3.5" />} onClick={onRetry}>
          {retryLabel}
        </Button>
      )
    }
  >
    {description}
  </Alert>
);

export default ErrorState;
