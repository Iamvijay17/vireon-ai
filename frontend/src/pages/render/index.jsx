import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Typography, Card, Row, Col, Progress, Tag, Descriptions, Button, Spin, Steps, Space, Alert, message, Empty
} from "antd";
import {
  ArrowLeftOutlined, SyncOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ClockCircleOutlined, FileTextOutlined, AudioOutlined, VideoCameraOutlined,
  CloudUploadOutlined, ThunderboltOutlined, ReloadOutlined, PlayCircleOutlined, RedoOutlined
} from "@ant-design/icons";
import { getVideoJob, restartVideoJob } from "../../services/api";
import { connect, joinJobRoom, leaveJobRoom, onJobProgress, onJobCompleted, onJobFailed, onConnect, isConnected, requestJobStatus, onJobStatus } from "../../services/socket";
import { colors } from "../../shared/theme";

const { Title, Text } = Typography;

const PIPELINE_STEPS = [
  { title: "Queued", status: "QUEUED", icon: <ClockCircleOutlined /> },
  { title: "Script", status: "SCRIPT_GENERATION", icon: <FileTextOutlined /> },
  { title: "Audio", status: "GENERATING_AUDIO", icon: <AudioOutlined /> },
  { title: "Assets", status: "PREPARING_ASSETS", icon: <ThunderboltOutlined /> },
  { title: "Render", status: "RENDERING", icon: <VideoCameraOutlined /> },
  { title: "Upload", status: "UPLOADING", icon: <CloudUploadOutlined /> },
  { title: "Complete", status: "COMPLETED", icon: <CheckCircleOutlined /> },
];

const STEP_ORDER = PIPELINE_STEPS.map((s) => s.status);

const RenderPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const jobId = searchParams.get("id");

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [restartLoading, setRestartLoading] = useState(false);

  // Store unsubscribe functions for cleanup
  const unsubscribesRef = useRef([]);
  // Track current jobId for handlers (updated on each render)
  const jobIdRef = useRef(jobId);
  jobIdRef.current = jobId;

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      setLoading(true);
      const res = await getVideoJob(jobId);
      setJob(res.data.job);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to fetch job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const handleRestart = async () => {
    if (!jobId) return;
    try {
      setRestartLoading(true);
      await restartVideoJob(jobId);
      message.success("Job restarted successfully");
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to restart job");
    } finally {
      setRestartLoading(false);
    }
  };

  // Cleanup previous event listeners
  const cleanup = useCallback(() => {
    unsubscribesRef.current.forEach((unsubscribe) => unsubscribe && unsubscribe());
    unsubscribesRef.current = [];
  }, []);

  // Setup socket event listeners
  const setupListeners = useCallback((currentJobId) => {
    cleanup();

    // Progress updates
    const unsubProgress = onJobProgress((data) => {
      if (data.jobId === currentJobId) {
        setJob((prev) => prev ? { ...prev, progress: data.progress, status: data.status, currentStep: data.currentStep, currentScene: data.currentScene } : prev);
      }
    });
    unsubscribesRef.current.push(unsubProgress);

    // Completion
    const unsubCompleted = onJobCompleted((data) => {
      if (data.jobId === currentJobId) {
        setJob((prev) => prev ? { ...prev, progress: 100, status: "COMPLETED", videoUrl: data.videoUrl, thumbnailUrl: data.thumbnailUrl } : prev);
        message.success("Video generation completed!");
      }
    });
    unsubscribesRef.current.push(unsubCompleted);

    // Failure
    const unsubFailed = onJobFailed((data) => {
      if (data.jobId === currentJobId) {
        setJob((prev) => prev ? { ...prev, status: "FAILED", error: data.error } : prev);
        message.error("Video generation failed");
      }
    });
    unsubscribesRef.current.push(unsubFailed);

    // Listen for initial job status after joining room
    const unsubStatus = onJobStatus((data) => {
      if (data.jobId === currentJobId) {
        setJob((prev) => ({
          ...(prev || {}),
          progress: data.progress,
          status: data.status,
          currentStep: data.currentStep,
          currentScene: data.currentScene,
          videoUrl: data.videoUrl || prev?.videoUrl,
          thumbnailUrl: data.thumbnailUrl || prev?.thumbnailUrl,
        }));
      }
    });
    unsubscribesRef.current.push(unsubStatus);

    // Reconnection handler - re-join room and get status
    const unsubConnect = onConnect(() => {
      if (jobIdRef.current) {
        joinJobRoom(jobIdRef.current);
        requestJobStatus(jobIdRef.current);
      }
    });
    unsubscribesRef.current.push(unsubConnect);
  }, [cleanup]);

  useEffect(() => {
    if (!jobId) {
      setLoading(false);
      return;
    }

    // Initial fetch
    fetchJob();

    // Connect socket if not connected
    connect();

    // Setup event listeners
    setupListeners(jobId);

    // Join room - server will immediately send jobStatus with current state
    joinJobRoom(jobId);

    // Cleanup on unmount or jobId change
    return () => {
      leaveJobRoom(jobId);
    };
  }, [jobId, fetchJob, setupListeners]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: colors.textSecondary }}>Loading job details...</div>
      </div>
    );
  }

  if (!jobId) {
    return (
      <Empty description="No job ID specified">
        <Button type="primary" onClick={() => navigate("/")}>Back to Dashboard</Button>
      </Empty>
    );
  }

  if (error && !job) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <Alert message="Error" description={error} type="error" showIcon style={{ maxWidth: 400, margin: "0 auto 24px" }} />
        <Button onClick={() => navigate("/")}>Back to Dashboard</Button>
      </div>
    );
  }

  // Determine current step index for the pipeline
  const currentStepIndex = STEP_ORDER.indexOf(job?.status);
  const isComplete = job?.status === "COMPLETED";
  const isFailed = job?.status === "FAILED";
  const isActive = !isComplete && !isFailed;

  return (
    <div>
      <Space style={{ marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/")}>Back</Button>
        <Button icon={<ReloadOutlined />} onClick={fetchJob} loading={loading}>Refresh</Button>
        {isFailed && (
          <Button 
            icon={<RedoOutlined />} 
            type="primary" 
            danger
            onClick={handleRestart} 
            loading={restartLoading}
          >
            Restart Job
          </Button>
        )}
      </Space>

      <Title level={4} style={{ color: colors.textPrimary, marginBottom: 8 }}>
        {job?.topic || "Render Progress"}
      </Title>

      {/* Overall Progress */}
      <Card style={{ borderRadius: 12, marginBottom: 24 }}>
        <Row gutter={24} align="middle">
          <Col xs={24} md={8}>
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <Progress
                type="circle"
                percent={job?.progress || 0}
                size={120}
                strokeColor={isFailed ? colors.error : colors.primary}
                status={isFailed ? "exception" : "active"}
              />
              <div style={{ marginTop: 8 }}>
                <Tag
                  color={isComplete ? "success" : isFailed ? "error" : "processing"}
                  icon={isComplete ? <CheckCircleOutlined /> : isFailed ? <CloseCircleOutlined /> : <SyncOutlined spin />}
                  style={{ fontSize: 13, padding: "4px 12px" }}
                >
                  {job?.status?.replace(/_/g, " ")}
                </Tag>
              </div>
            </div>
          </Col>
          <Col xs={24} md={16}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="Job ID">
                <Text copyable style={{ fontSize: 12 }}>{job?._id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Type">
                <Tag>{job?.type}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Resolution">{job?.resolution}</Descriptions.Item>
              <Descriptions.Item label="Language">{job?.language}</Descriptions.Item>
              <Descriptions.Item label="Voice">{job?.voice}</Descriptions.Item>
              <Descriptions.Item label="Created">
                {job?.createdAt ? new Date(job.createdAt).toLocaleString() : "-"}
              </Descriptions.Item>
            </Descriptions>
          </Col>
        </Row>
      </Card>

      {/* Pipeline Steps */}
      <Card title="Pipeline" style={{ borderRadius: 12, marginBottom: 24 }} headStyle={{ fontWeight: 600 }}>
        <Steps
          current={currentStepIndex >= 0 ? currentStepIndex : 0}
          status={isFailed ? "error" : isComplete ? "finish" : "process"}
          direction="horizontal"
          size="small"
          style={{ marginTop: 8 }}
        >
          {PIPELINE_STEPS.map((step, idx) => (
            <Steps.Step
              key={step.status}
              title={step.title}
              icon={
                idx < currentStepIndex ? <CheckCircleOutlined /> :
                idx === currentStepIndex && isActive ? <SyncOutlined spin /> :
                step.icon
              }
              status={
                idx < currentStepIndex ? "finish" :
                idx === currentStepIndex && isFailed ? "error" :
                idx === currentStepIndex ? "process" : "wait"
              }
            />
          ))}
        </Steps>

        {isActive && job?.currentStep && (
          <Alert
            style={{ marginTop: 16, borderRadius: 8 }}
            message={
              <Space>
                <SyncOutlined spin />
                <span>
                  {job?.currentStep?.replace(/_/g, " ")}
                  {job?.currentScene ? ` — Scene ${job.currentScene}` : ""}
                </span>
              </Space>
            }
            type="info"
            showIcon={false}
          />
        )}

        {isFailed && job?.error && (
          <Alert
            style={{ marginTop: 16, borderRadius: 8 }}
            message={typeof job.error === 'string' ? job.error : job.error?.message || "An error occurred"}
            type="error"
            showIcon
          />
        )}

        {isComplete && (
          <Alert
            style={{ marginTop: 16, borderRadius: 8 }}
            message="Video generation completed successfully!"
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
          />
        )}
      </Card>

      {/* Video / Download section */}
      {isComplete && job?.videoUrl && (
        <Card title="Output" style={{ borderRadius: 12 }} headStyle={{ fontWeight: 600 }}>
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Alert
              message="Video is stored on GitHub"
              description={job.videoUrl}
              type="success"
              showIcon
              action={
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  href={job.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Download Video
                </Button>
              }
            />
            {job.thumbnailUrl && (
              <div>
                <Text strong>Thumbnail:</Text>
                <div style={{ marginTop: 8 }}>
                  <img
                    src={job.thumbnailUrl}
                    alt="Video thumbnail"
                    style={{ maxWidth: 300, borderRadius: 8, border: `1px solid ${colors.border}` }}
                  />
                </div>
              </div>
            )}
          </Space>
        </Card>
      )}
    </div>
  );
};

export default RenderPage;