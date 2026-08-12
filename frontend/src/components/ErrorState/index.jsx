import { RotateCw } from "lucide-react";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";

/**
 * Consistent persistent error banner (as opposed to a transient toast) for
 * page-level failures, with an optional retry action.
 */
const ErrorState = ({ message = "Something went wrong", description, onRetry, retryLabel = "Retry" }) => (
  <Alert
    type="error"
    title={message}
    action={
      onRetry && (
        <Button size="sm" variant="danger" icon={<RotateCw className="size-3.5" />} onClick={onRetry}>
          {retryLabel}
        </Button>
      )
    }
  >
    {description}
  </Alert>
);

export default ErrorState;
