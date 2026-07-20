import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Typography, Card, Row, Col, Progress, Tag, Descriptions, Button, Steps, Space, Alert, message
} from "antd";
import {
  ArrowLeftOutlined, SyncOutlined, CheckCircleOutlined, CloseCircleOutlined,
  ClockCircleOutlined, FileTextOutlined, AudioOutlined, VideoCameraOutlined,
  CloudUploadOutlined, ThunderboltOutlined, ReloadOutlined, PlayCircleOutlined, RedoOutlined, DownloadOutlined, EditOutlined
} from "@ant-design/icons";
import { getVideoJob, restartVideoJob, rerenderVideoJob } from "../../services/api";
import { connect, joinJobRoom, leaveJobRoom, onJobProgress, onJobCompleted, onJobFailed, onConnect, onDisconnect, requestJobStatus, onJobStatus, isConnected } from "../../services/socket";
import { ThemeContext } from "../../shared/themeContextValue";
import { LoadingState, EmptyState, ErrorState } from "../../components";

const { Title, Text } = Typography;

const PIPELINE_STEPS = [
  { title: "Queued", status: "QUEUED", icon: <ClockCircleOutlined /> },
  { title: "Script", status: "SCRIPT_GENERATION", icon: <FileTextOutlined /> },
  { title: "Audio", status: "GENERATING_AUDIO", icon: <AudioOutlined /> },
  { title: "Images", status: "GENERATING_IMAGES", icon: <FileTextOutlined /> },
  { title: "Assets", status: "PREPARING_ASSETS", icon: <ThunderboltOutlined /> },
  { title: "Render", status: "RENDERING", icon: <VideoCameraOutlined /> },
  { title: "Upload", status: "UPLOADING", icon: <CloudUploadOutlined /> },
  { title: "Complete", status: "COMPLETED", icon: <CheckCircleOutlined /> },
];

const STEP_ORDER = PIPELINE_STEPS.map((s) => s.status);

const RenderPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { colors } = useContext(ThemeContext);
  const jobId = searchParams.get("id");

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [restartLoading, setRestartLoading] = useState(false);
  const [rerenderLoading, setRerenderLoading] = useState(false);
  const [socketStatus, setSocketStatus] = useState(() => isConnected() ? "connected" : "disconnected");

  // Store unsubscribe functions for cleanup
  const unsubscribesRef = useRef([]);
  const videoRef = useRef(null);

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

  const handleRerender = async () => {
    if (!jobId) return;
    try {
      setRerenderLoading(true);
      await rerenderVideoJob(jobId);
      message.success("Re-render started successfully");
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to re-render job");
    } finally {
      setRerenderLoading(false);
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
      setSocketStatus("connected");
      if (jobId) {
        joinJobRoom(jobId);
        requestJobStatus(jobId);
      }
    });
    unsubscribesRef.current.push(unsubConnect);

    // Disconnection handler
    const unsubDisconnect = onDisconnect((reason) => {
      setSocketStatus(reason === "io client disconnect" ? "disconnected" : "reconnecting");
    });
    unsubscribesRef.current.push(unsubDisconnect);
  }, [cleanup, jobId]);

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

    // Set initial socket connection status (check synchronously)
    setSocketStatus(isConnected() ? "connected" : "disconnected");

    // Cleanup on unmount or jobId change
    return () => {
      leaveJobRoom(jobId);
    };
  }, [jobId, fetchJob, setupListeners]);

  if (loading) {
    return <LoadingState label="Loading job details..." />;
  }

  if (!jobId) {
    return (
      <EmptyState
        description="No job ID specified"
        actionLabel="Back to Dashboard"
        onAction={() => navigate("/")}
      />
    );
  }

  if (error && !job) {
    return (
      <div style={{ textAlign: "center", padding: 48 }}>
        <ErrorState message="Error" description={error} />
        <Button style={{ marginTop: 16 }} onClick={() => navigate("/")}>Back to Dashboard</Button>
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
        {isComplete && (
          <>
            <Button 
              icon={<EditOutlined />} 
              type="primary"
              onClick={() => navigate(`/studio?id=${jobId}`)}
            >
              Studio Editor
            </Button>
            <Button 
              icon={<RedoOutlined />} 
              type="primary"
              onClick={handleRerender} 
              loading={rerenderLoading}
            >
              Re-render
            </Button>
          </>
        )}
      </Space>

      <Space style={{ marginBottom: 16 }} align="center">
        <Title level={4} style={{ color: colors.textPrimary, marginBottom: 0 }}>
          {job?.topic || "Render Progress"}
        </Title>
        <Tag
          color={
            socketStatus === "connected" ? "green" :
            socketStatus === "reconnecting" ? "orange" : "default"
          }
          style={{ fontSize: 11, padding: "0 8px", lineHeight: "20px" }}
        >
          <Space size={4}>
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                backgroundColor:
                  socketStatus === "connected" ? colors.success :
                  socketStatus === "reconnecting" ? colors.warning : colors.textTertiary,
              }}
            />
            {socketStatus === "connected" ? "Live" :
             socketStatus === "reconnecting" ? "Reconnecting..." : "Offline"}
          </Space>
        </Tag>
      </Space>

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

      {/* Video / Player section */}
      {isComplete && job?.videoUrl && (
        <Card
          title={
            <Space>
              <PlayCircleOutlined style={{ color: colors.primary }} />
              <span>Output Video</span>
            </Space>
          }
          style={{ borderRadius: 12 }}
          headStyle={{ fontWeight: 600 }}
        >
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {/* HTML5 Video Player */}
            <div
              style={{
                width: "100%",
                maxWidth: 720,
                margin: "0 auto",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
                background: "#000",
              }}
            >
              <video
                ref={videoRef}
                src={job.videoUrl}
                controls
                autoPlay
                style={{
                  width: "100%",
                  display: "block",
                  aspectRatio: job?.resolution === "9:16" ? "9/16" : "16/9",
                  objectFit: "contain",
                }}
                poster={job.thumbnailUrl || undefined}
              >
                Your browser does not support the video tag.
              </video>
            </div>

            {/* Video info and download */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                padding: "4px 0",
              }}
            >
              <Space size={16}>
                {job.resolution && (
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    Resolution: <Text strong>{job.resolution}</Text>
                  </Text>
                )}
                {job.duration && (
                  <Text type="secondary" style={{ fontSize: 13 }}>
                    Duration: <Text strong>{job.duration}s</Text>
                  </Text>
                )}
              </Space>

              <Space>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  href={job.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in new tab
                </Button>
                <Button
                  icon={<DownloadOutlined />}
                  href={job.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  Download
                </Button>
              </Space>
            </div>
          </Space>
        </Card>
      )}
    </div>
  );
};

export default RenderPage;