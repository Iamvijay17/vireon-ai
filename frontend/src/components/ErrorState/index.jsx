import { Alert, Button } from "antd";
import { ReloadOutlined } from "@ant-design/icons";

/**
 * Consistent persistent error banner (as opposed to a transient message.error
 * toast) for page-level failures, with an optional retry action.
 */
const ErrorState = ({
  message = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Retry",
}) => (
  <Alert
    type="error"
    showIcon
    message={message}
    description={description}
    action={
      onRetry && (
        <Button size="small" danger icon={<ReloadOutlined />} onClick={onRetry}>
          {retryLabel}
        </Button>
      )
    }
  />
);

export default ErrorState;
