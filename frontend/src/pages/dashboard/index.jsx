import React from "react";
import { Typography, Card, Row, Col, Statistic, Table } from "antd";
import {
  ProjectOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from "@ant-design/icons";
import { colors } from "../../shared/theme";

const { Title } = Typography;

const stats = [
  { title: "Active Projects", value: 12, icon: <ProjectOutlined />, color: colors.primary },
  { title: "Renders Queued", value: 8, icon: <ClockCircleOutlined />, color: colors.warning },
  { title: "Completed Renders", value: 342, icon: <CheckCircleOutlined />, color: colors.success },
  { title: "Total Outputs", value: "1.2K", icon: <ThunderboltOutlined />, color: colors.info },
];

const recentActivity = [
  { key: "1", project: "Vireon Web App", status: "Completed", date: "2 min ago" },
  { key: "2", project: "AI Model v3", status: "Rendering", date: "5 min ago" },
  { key: "3", project: "Dashboard Redesign", status: "Queued", date: "12 min ago" },
  { key: "4", project: "Animation Sequence", status: "Completed", date: "1 hr ago" },
];

const columns = [
  { title: "Project", dataIndex: "project", key: "project" },
  {
    title: "Status",
    dataIndex: "status",
    key: "status",
    render: (text) => (
      <span
        style={{
          color:
            text === "Completed"
              ? colors.success
              : text === "Rendering"
              ? colors.primary
              : colors.warning,
          fontWeight: 500,
        }}
      >
        {text}
      </span>
    ),
  },
  { title: "Date", dataIndex: "date", key: "date" },
];

const Dashboard = () => (
  <div>
    <Title level={4} style={{ marginBottom: 24, color: colors.textPrimary }}>
      Dashboard
    </Title>
    <Row gutter={[16, 16]}>
      {stats.map((s) => (
        <Col xs={12} lg={6} key={s.title}>
          <Card hoverable style={{ borderRadius: 12 }}>
            <Statistic
              title={s.title}
              value={s.value}
              prefix={
                <span style={{ color: s.color, fontSize: 22, marginRight: 8 }}>
                  {s.icon}
                </span>
              }
              valueStyle={{ color: colors.textPrimary }}
            />
          </Card>
        </Col>
      ))}
    </Row>

    <Card
      title="Recent Activity"
      style={{ marginTop: 24, borderRadius: 12 }}
      headStyle={{ fontWeight: 600 }}
    >
      <Table
        dataSource={recentActivity}
        columns={columns}
        pagination={false}
        showHeader={false}
        size="small"
      />
    </Card>
  </div>
);

export default Dashboard;
