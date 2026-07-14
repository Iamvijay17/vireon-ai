import React from "react";
import { Typography, Card } from "antd";
import { colors } from "../../shared/theme";

const { Title, Paragraph } = Typography;

const PlaceholderPage = ({ title, description }) => (
  <div>
    <Title level={4} style={{ marginBottom: 16, color: colors.textPrimary }}>
      {title}
    </Title>
    <Card style={{ borderRadius: 12, minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: 48 }}>
        <Paragraph style={{ color: colors.textSecondary, fontSize: 16, marginBottom: 0 }}>
          {description || `The ${title} page is coming soon.`}
        </Paragraph>
      </div>
    </Card>
  </div>
);

export default PlaceholderPage;
