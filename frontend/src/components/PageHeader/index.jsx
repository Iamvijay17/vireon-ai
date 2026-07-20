import { useContext } from "react";
import { Typography, Space } from "antd";
import { ThemeContext } from "../../shared/themeContextValue";

const { Title, Text } = Typography;

/**
 * Consistent page-level header: title + optional description on the left,
 * actions (buttons) on the right. Used in place of each page hand-rolling
 * its own title/flex-row header block.
 */
const PageHeader = ({ title, description, extra }) => {
  const { colors } = useContext(ThemeContext);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 16,
        marginBottom: 24,
      }}
    >
      <div>
        <Title level={4} style={{ margin: 0, color: colors.textPrimary }}>
          {title}
        </Title>
        {description && (
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
            {description}
          </Text>
        )}
      </div>
      {extra && <Space size={12}>{extra}</Space>}
    </div>
  );
};

export default PageHeader;
