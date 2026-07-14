import React, { useState, useEffect } from "react";
import { Typography, Card, Row, Col, Statistic, Table, Tag, Space, Button, Spin, Empty, message } from "antd";
import {
  ProjectOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  SyncOutlined,
  PlusOutlined,
  EyeOutlined,
  DeleteOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { getVideoJobs, deleteVideoJob } from "../../services/api";
import { connect, onJobCreated, onJobCompleted, onJobFailed } from "../../services/socket";
import { colors } from "../../shared/theme";

const { Title, Text } = Typography;

const STATUS_MAP = {
  QUEUED: { color: "default", icon: <ClockCircleOutlined /> },
  SCRIPT_GENERATION: { color: "processing", icon: <SyncOutlined spin /> },
  SCRIPT_COMPLETED: { color: "blue", icon: <CheckCircleOutlined /> },
  GENERATING_AUDIO: { color: "processing", icon: <SyncOutlined spin /> },
  AUDIO_COMPLETED: { color: "geekblue", icon: <CheckCircleOutlined /> },
  PREPARING_ASSETS: { color: "processing", icon: <SyncOutlined spin /> },
  RENDERING: { color: "processing", icon: <SyncOutlined spin /> },
  UPLOADING: { color: "processing", icon: <SyncOutlined spin /> },
  COMPLETED: { color: "success", icon: <CheckCircleOutlined /> },
  FAILED: { color: "error", icon: <CloseCircleOutlined /> },
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });

  const fetchJobs = async (page = 1) => {
    try {
      setLoading(true);
      const res = await getVideoJobs(page);
      setJobs(res.data.jobs);
      setPagination(res.data.pagination);
    } catch (err) {
      message.error("Failed to fetch jobs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    connect();
  }, []);

  // Real-time updates via Socket.IO
  useEffect(() => {
    const unsubCreated = onJobCreated((data) => {
      setJobs((prev) => [{ ...data, status: data.status || "QUEUED", progress: 0 }, ...prev]);
    });

    const unsubCompleted = onJobCompleted((data) => {
      setJobs((prev) =>
        prev.map((j) => (j._id === data.jobId ? { ...j, status: "COMPLETED", progress: 100, videoUrl: data.videoUrl } : j))
      );
    });

    const unsubFailed = onJobFailed((data) => {
      setJobs((prev) =>
        prev.map((j) => (j._id === data.jobId ? { ...j, status: "FAILED", error: data.error } : j))
      );
    });

    return () => {
      unsubCreated();
      unsubCompleted();
      unsubFailed();
    };
  }, []);

  const handleDelete = async (id) => {
    try {
      await deleteVideoJob(id);
      message.success("Job deleted");
      setJobs((prev) => prev.filter((j) => j._id !== id));
    } catch {
      message.error("Failed to delete job");
    }
  };

  // Stats computation
  const stats = [
    { title: "Total Jobs", value: pagination.total, icon: <ProjectOutlined />, color: colors.primary },
    { title: "Processing", value: jobs.filter((j) => !["COMPLETED", "FAILED", "QUEUED"].includes(j.status)).length, icon: <SyncOutlined />, color: colors.warning },
    { title: "Completed", value: jobs.filter((j) => j.status === "COMPLETED").length, icon: <CheckCircleOutlined />, color: colors.success },
    { title: "Failed", value: jobs.filter((j) => j.status === "FAILED").length, icon: <CloseCircleOutlined />, color: colors.error },
  ];

  const columns = [
    {
      title: "Topic",
      dataIndex: "topic",
      key: "topic",
      ellipsis: true,
      render: (text, record) => (
        <Button type="link" onClick={() => navigate(`/render?id=${record._id}`)} style={{ padding: 0 }}>
          {text}
        </Button>
      ),
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      width: 120,
      render: (text) => <Tag>{text}</Tag>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 180,
      render: (status) => {
        const s = STATUS_MAP[status] || { color: "default", icon: null };
        return (
          <Tag color={s.color} icon={s.icon}>
            {status?.replace(/_/g, " ")}
          </Tag>
        );
      },
    },
    {
      title: "Progress",
      dataIndex: "progress",
      key: "progress",
      width: 150,
      render: (progress, record) => {
        const isActive = record.status !== "COMPLETED" && record.status !== "FAILED";
        return (
          <Space>
            {isActive ? <SyncOutlined spin style={{ color: colors.primary }} /> : null}
            <Text>{progress}%</Text>
          </Space>
        );
      },
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (date) => <Text type="secondary">{new Date(date).toLocaleString()}</Text>,
    },
    {
      title: "Actions",
      key: "actions",
      width: 100,
      render: (_, record) => (
        <Space>
          <Button
            type="text"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/render?id=${record._id}`)}
          />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record._id)}
          />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <Title level={4} style={{ margin: 0, color: colors.textPrimary }}>
          Dashboard
        </Title>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => navigate("/wizard")}>
          Create Video
        </Button>
      </div>

      {/* Stats */}
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

      {/* Job List */}
      <Card
        title="Recent Jobs"
        style={{ marginTop: 24, borderRadius: 12 }}
        headStyle={{ fontWeight: 600 }}
        extra={
          <Button size="small" onClick={() => fetchJobs(pagination.page)} loading={loading}>
            Refresh
          </Button>
        }
      >
        {loading && jobs.length === 0 ? (
          <div style={{ textAlign: "center", padding: 48 }}><Spin size="large" /></div>
        ) : jobs.length === 0 ? (
          <Empty description="No jobs yet. Create your first video!" />
        ) : (
          <Table
            dataSource={jobs}
            columns={columns}
            rowKey="_id"
            pagination={{
              current: pagination.page,
              total: pagination.total,
              pageSize: 20,
              onChange: fetchJobs,
              showSizeChanger: false,
            }}
            size="middle"
          />
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
