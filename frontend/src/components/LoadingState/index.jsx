import { useContext } from "react";
import { Spin } from "antd";
import { ThemeContext } from "../../shared/themeContextValue";

/**
 * Consistent centered loading block, replacing the hand-rolled
 * `<Spin size="large"/>` + margin-top div repeated across pages.
 */
const LoadingState = ({ label = "Loading...", minHeight = 240 }) => {
  const { colors } = useContext(ThemeContext);

  return (
    <div style={{ textAlign: "center", padding: 48, minHeight }}>
      <Spin size="large" />
      {label && (
        <div style={{ marginTop: 16, color: colors.textSecondary, fontSize: 14 }}>
          {label}
        </div>
      )}
    </div>
  );
};

export default LoadingState;
