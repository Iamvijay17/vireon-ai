let opener = null; // registered by ConfirmDialogHost

export const registerConfirmOpener = (fn) => {
  opener = fn;
};

/**
 * Promise-based confirm, replacing antd's `Modal.confirm({ title, content, onOk })`.
 * Usage: if (await confirmDialog({ title: "Regenerate script?", danger: true })) { ... }
 */
export const confirmDialog = (opts) => {
  if (!opener) throw new Error("ConfirmDialogHost is not mounted");
  return opener(opts);
};

export default confirmDialog;
