import { Empty, Button } from "antd";

/**
 * Consistent "no data" state: Antd Empty + an optional call-to-action button,
 * replacing each page's ad hoc <Empty description="..."><Button/></Empty>.
 */
const EmptyState = ({ description, actionLabel, actionIcon, onAction }) => (
  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description}>
    {actionLabel && onAction && (
      <Button type="primary" icon={actionIcon} onClick={onAction}>
        {actionLabel}
      </Button>
    )}
  </Empty>
);

export default EmptyState;
