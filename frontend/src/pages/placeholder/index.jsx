import { useContext } from "react";
import { Typography, Card } from "antd";
import { RocketOutlined } from "@ant-design/icons";
import { ThemeContext } from "../../shared/themeContextValue";

const { Title, Paragraph } = Typography;

const PlaceholderPage = ({ title, description }) => {
  const { colors } = useContext(ThemeContext);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16, color: colors.textPrimary }}>
        {title}
      </Title>
      <Card style={{ borderRadius: 16, minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 48, maxWidth: 360 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: colors.primaryBg,
              color: colors.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              margin: "0 auto 16px",
            }}
          >
            <RocketOutlined />
          </div>
          <Title level={5} style={{ color: colors.textPrimary, marginBottom: 8 }}>
            Coming soon
          </Title>
          <Paragraph style={{ color: colors.textSecondary, fontSize: 15, marginBottom: 0 }}>
            {description || `The ${title} page is coming soon.`}
          </Paragraph>
        </div>
      </Card>
    </div>
  );
};

export default PlaceholderPage;
