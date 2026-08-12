let emit = null; // registered by ToastProvider; lets `toast.x()` work outside React tree

export const registerToastEmitter = (fn) => {
  emit = fn;
};

// Imperative API mirroring antd's `message.x()` — callable from anywhere,
// including async handlers with no React context.
export const toast = {
  success: (message, duration) => emit?.("success", message, duration),
  error: (message, duration) => emit?.("error", message, duration),
  info: (message, duration) => emit?.("info", message, duration),
};

export default toast;
