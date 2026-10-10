import { RotateCw, Ban, Trash2, Pencil, CircleHelp } from "lucide-react";
import { Button } from "../../components/ui/Button";

/** The buttons a post currently allows (the server decides: post.actions). */
export const PostActionButtons = ({ post, actions, onEdit, size = "sm" }) => {
  const a = post.actions || {};
  const { isBusy } = actions;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {a.canEdit && onEdit && <Button size={size} variant="secondary" icon={<Pencil className="size-4" />} onClick={() => onEdit(post)}>{post.status === "SCHEDULED" ? "Edit / reschedule" : "Edit"}</Button>}
      {a.canRetry && <Button size={size} variant="primary" icon={<RotateCw className="size-4" />} loading={isBusy(`retry:${post._id}`)} onClick={() => actions.retry(post)}>Retry this one</Button>}
      {a.canRetryUnknown && <Button size={size} variant="secondary" icon={<CircleHelp className="size-4" />} loading={isBusy(`retry:${post._id}`)} onClick={() => actions.retryNotPosted(post)}>It isn&apos;t posted - retry</Button>}
      {a.canCancel && <Button size={size} variant="secondary" icon={<Ban className="size-4" />} loading={isBusy(`cancel:${post._id}`)} onClick={() => actions.cancel(post)}>Cancel</Button>}
      {a.canDelete && <Button size={size} variant="ghost" icon={<Trash2 className="size-4" />} loading={isBusy(`delete:${post._id}`)} onClick={() => actions.remove(post)}>Delete</Button>}
    </div>
  );
};
