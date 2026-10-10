import { confirmDialog } from "../../components/ui/confirmBus";
import { useInvalidate } from "../../lib/useApiQuery";
import { queryKeys } from "../../lib/queryClient";
import { cancelSocialPost, retrySocialPost, deleteSocialPost } from "../../services/api";
import { useBusy } from "./usePromotion";
import { platformLabel } from "./format";

/**
 * Cancel / retry / delete for one post, with the confirmations that keep them safe:
 *  - retry only ever acts on THAT destination (successful ones are never re-sent);
 *  - an "outcome unknown" post asks the person to check the platform first.
 */
export function usePostActions({ onChanged } = {}) {
  const invalidate = useInvalidate();
  const { isBusy, run } = useBusy();
  const done = (res) => {
    if (res) {
      invalidate(queryKeys.social.all);
      onChanged?.(res.data);
    }
    return res;
  };

  return {
    isBusy,
    retry: (post) => run(`retry:${post._id}`, () => retrySocialPost(post._id), {
      success: () => `Retrying ${platformLabel(post.platform)}${post.accountLabel ? ` · ${post.accountLabel}` : ""}`,
    }).then(done),
    retryNotPosted: async (post) => {
      const yes = await confirmDialog({
        title: "Is it really not posted?",
        content: `Vireon sent this post to ${platformLabel(post.platform)} but never got confirmation. Open the account on ${platformLabel(post.platform)} and look. Only continue if the post is NOT there - otherwise you will post it twice.`,
        confirmText: "It isn't posted - retry", danger: true,
      });
      if (!yes) return null;
      return run(`retry:${post._id}`, () => retrySocialPost(post._id, { confirmNotPosted: true }), { success: "Retrying" }).then(done);
    },
    cancel: async (post) => {
      const yes = await confirmDialog({
        title: "Cancel this post?",
        content: post.status === "SCHEDULED" ? "It will not be sent. You can schedule it again from the promotion." : "Posting stops before anything reaches the platform.",
        confirmText: "Cancel post", danger: true,
      });
      if (!yes) return null;
      return run(`cancel:${post._id}`, () => cancelSocialPost(post._id), { success: "Post cancelled" }).then(done);
    },
    remove: async (post) => {
      const yes = await confirmDialog({ title: "Delete this record?", content: "It never reached the platform, so only the record here is removed.", confirmText: "Delete", danger: true });
      if (!yes) return null;
      return run(`delete:${post._id}`, () => deleteSocialPost(post._id), { success: "Deleted" }).then(done);
    },
  };
}
