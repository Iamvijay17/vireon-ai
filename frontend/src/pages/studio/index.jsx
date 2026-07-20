import { useState, useEffect, useCallback, useMemo, useRef, useContext } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Typography, Card, Row, Col, Button, Form, Input, Select, Space, message, Divider, Tag, Collapse, InputNumber, Alert
} from "antd";
import {
  ArrowLeftOutlined, SaveOutlined, RedoOutlined, SettingOutlined, EditOutlined, TranslationOutlined, PictureOutlined, RightOutlined
} from "@ant-design/icons";
import { getVideoJob, updateVideoScenes, rerenderVideoJob } from "../../services/api";
import { connect, joinJobRoom, leaveJobRoom, onJobProgress, onJobCompleted, onJobFailed, onConnect, onDisconnect, onJobStatus, isConnected } from "../../services/socket";
import { ThemeContext } from "../../shared/themeContextValue";
import { LoadingState, EmptyState } from "../../components";

const { Title, Text } = Typography;
const { TextArea } = Input;

const SCENE_TYPE_OPTIONS = [
  { value: "title", label: "Title" },
  { value: "content", label: "Content" },
  { value: "image", label: "Image" },
  { value: "end", label: "End" },
];

const TRANSITION_OPTIONS = [
  { value: "fade", label: "Fade" },
  { value: "slide", label: "Slide" },
  { value: "zoom", label: "Zoom" },
  { value: "dissolve", label: "Dissolve" },
];

const CAMERA_OPTIONS = [
  { value: "static", label: "Static" },
  { value: "zoom-in", label: "Zoom In" },
  { value: "zoom-out", label: "Zoom Out" },
  { value: "slide", label: "Slide" },
];

const StudioPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { colors } = useContext(ThemeContext);
  const jobId = searchParams.get("id");

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rerendering, setRerendering] = useState(false);
  const [socketStatus, setSocketStatus] = useState(() => isConnected() ? "connected" : "disconnected");
  const [editedScenes, setEditedScenes] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedSceneIndex, setSelectedSceneIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef(null);

  // Calculate scene start times for navigation
  const sceneTimeline = useMemo(() => {
    return editedScenes.reduce((acc, scene) => {
      const start = acc.length ? acc[acc.length - 1].endTime : 0;
      const end = start + (scene.duration || 8);
      acc.push({ ...scene, startTime: start, endTime: end });
      return acc;
    }, []);
  }, [editedScenes]);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      setLoading(true);
      const res = await getVideoJob(jobId);
      setJob(res.data.job);
      setEditedScenes(res.data.job.script?.scenes || []);
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to fetch job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const handleSceneChange = (index, field, value) => {
    const updated = [...editedScenes];
    updated[index] = { ...updated[index], [field]: value };
    setEditedScenes(updated);
    setHasChanges(true);
  };

  const handleAudioTextChange = (index, value) => {
    const updated = [...editedScenes];
    updated[index] = { ...updated[index], audio: { ...updated[index].audio, text: value } };
    setEditedScenes(updated);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!jobId) return;
    try {
      setSaving(true);
      await updateVideoScenes(jobId, editedScenes);
      setHasChanges(false);
      message.success("Scenes saved successfully!");
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to save scenes");
    } finally {
      setSaving(false);
    }
  };

  const handleRerender = async () => {
    if (!jobId) return;
    try {
      setRerendering(true);
      await rerenderVideoJob(jobId);
      message.success("Re-render started!");
      navigate(`/render?id=${jobId}`);
    } catch (err) {
      message.error(err.response?.data?.error || "Failed to start re-render");
    } finally {
      setRerendering(false);
    }
  };

  // Socket listeners
  useEffect(() => {
    if (!jobId) return;
    connect();
    joinJobRoom(jobId);

    const unsubProgress = onJobProgress((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => prev ? { ...prev, progress: data.progress, status: data.status } : prev);
      }
    });
    const unsubCompleted = onJobCompleted((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => prev ? { ...prev, progress: 100, status: "COMPLETED" } : prev);
        message.success("Re-render completed!");
      }
    });
    const unsubFailed = onJobFailed((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => prev ? { ...prev, status: "FAILED", error: data.error } : prev);
        message.error("Re-render failed");
      }
    });
    const unsubStatus = onJobStatus((data) => {
      if (data.jobId === jobId) {
        setJob((prev) => ({ ...(prev || {}), ...data }));
      }
    });
    const unsubConnect = onConnect(() => setSocketStatus("connected"));
    const unsubDisconnect = onDisconnect(() => setSocketStatus("disconnected"));

    return () => {
      leaveJobRoom(jobId);
      unsubProgress();
      unsubCompleted();
      unsubFailed();
      unsubStatus();
      unsubConnect();
      unsubDisconnect();
    };
  }, [jobId]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  if (loading) {
    return <LoadingState label="Loading studio..." />;
  }

  if (!job) {
    return (
      <EmptyState
        description="Job not found"
        actionLabel="Back to Dashboard"
        onAction={() => navigate("/")}
      />
    );
  }

  const canEdit = job.status === "COMPLETED" || job.status === "FAILED" || job.status === "SCRIPT_COMPLETED";

  return (
    <div>
      <Space style={{ marginBottom: 24 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/")}>Back</Button>
        <Title level={4} style={{ color: colors.textPrimary, marginBottom: 0 }}>
          <EditOutlined /> Studio Editor — {job.topic}
        </Title>
        <Tag color={socketStatus === "connected" ? "green" : "default"}>
          {socketStatus === "connected" ? "Live" : "Offline"}
        </Tag>
      </Space>

      {/* Action Bar */}
      <Card style={{ borderRadius: 12, marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Space>
              <Text strong>Total Scenes: </Text>
              <Tag color="blue">{editedScenes.length}</Tag>
              <Text type="secondary">Job ID: {job._id}</Text>
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<SaveOutlined />} onClick={handleSave} loading={saving} disabled={!hasChanges || !canEdit}>
                Save Changes
              </Button>
              <Button type="primary" icon={<RedoOutlined />} onClick={handleRerender} loading={rerendering} disabled={!canEdit}>
                Re-render
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Remotion-style Preview */}
      {job?.videoUrl && (
        <Card title="Preview" style={{ borderRadius: 12, marginBottom: 24 }} headStyle={{ fontWeight: 600 }}>
          <div style={{ width: "100%", maxWidth: 800, margin: "0 auto" }}>
            <video
              ref={videoRef}
              src={job.videoUrl}
              controls
              style={{
                width: "100%",
                display: "block",
                borderRadius: 8,
                background: "#000",
              }}
              onTimeUpdate={(e) => {
                const time = e.target.currentTime;
                setCurrentTime(time);
                // Auto-select scene based on current time
                const sceneIndex = sceneTimeline.findIndex(s => time >= s.startTime && time < s.endTime);
                if (sceneIndex >= 0 && sceneIndex !== selectedSceneIndex) {
                  setSelectedSceneIndex(sceneIndex);
                }
              }}
            />
          </div>

          {/* Scene Timeline / Navigation */}
          <div style={{ marginTop: 20 }}>
            <Title level={5} style={{ marginBottom: 14 }}>Scene Timeline</Title>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sceneTimeline.map((scene, index) => {
                const isActive = index === selectedSceneIndex;
                const isPast = currentTime >= scene.endTime;
                return (
                  <Card
                    key={index}
                    size="small"
                    onClick={() => {
                      setSelectedSceneIndex(index);
                      if (videoRef.current) {
                        videoRef.current.currentTime = scene.startTime;
                      }
                    }}
                    style={{
                      flex: "1 1 150px",
                      minWidth: 150,
                      cursor: "pointer",
                      border: isActive ? `2px solid ${colors.primary}` : undefined,
                      backgroundColor: isActive ? colors.primaryBg : isPast ? colors.surfaceActive : undefined,
                      opacity: isActive ? 1 : isPast ? 0.7 : 1,
                      borderRadius: 8,
                      transition: "all 0.3s ease",
                    }}
                    bodyStyle={{ padding: 12 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        backgroundColor: isActive ? colors.primary : colors.borderLight,
                        color: isActive ? colors.textInverse : colors.textSecondary,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}>
                        {scene.sceneNumber || index + 1}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 400,
                          color: isActive ? colors.primary : colors.textPrimary,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}>
                          {scene.title || `Scene ${scene.sceneNumber || index + 1}`}
                        </div>
                        <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
                          {scene.duration}s • {scene.sceneType}
                        </div>
                      </div>
                      {isActive && <RightOutlined style={{ color: colors.primary, flexShrink: 0 }} />}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Scene Editor */}
      {!canEdit && (
        <Alert
          message="This job cannot be edited in its current state."
          description="Only completed or failed jobs can be edited and re-rendered."
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {editedScenes.length === 0 ? (
        <EmptyState description="No scenes found" />
      ) : (
        <Collapse
          accordion={false}
          defaultActiveKey={editedScenes.map((_, i) => `scene-${i}`)}
          style={{ borderRadius: 12 }}
        >
          {editedScenes.map((scene, index) => (
            <Collapse.Panel
              key={`scene-${index}`}
              header={
                <Space>
                  <Tag color="blue">Scene {scene.sceneNumber || index + 1}</Tag>
                  <Text strong>{scene.title || "Untitled Scene"}</Text>
                  <Tag color={scene.sceneType === "title" ? "green" : scene.sceneType === "end" ? "red" : "default"}>
                    {scene.sceneType}
                  </Tag>
                  <Text type="secondary">{scene.duration}s</Text>
                </Space>
              }
            >
              <Card size="small" style={{ background: colors.surfaceHover }}>
                <Row gutter={16}>
                  {/* Basic Info */}
                  <Col span={24}>
                    <Title level={5}><EditOutlined /> Basic Info</Title>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Scene Number" style={{ marginBottom: 12 }}>
                      <InputNumber min={1} value={scene.sceneNumber} onChange={(val) => handleSceneChange(index, "sceneNumber", val)} disabled={!canEdit} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Scene Type" style={{ marginBottom: 12 }}>
                      <Select value={scene.sceneType} onChange={(val) => handleSceneChange(index, "sceneType", val)} options={SCENE_TYPE_OPTIONS} disabled={!canEdit} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Title" style={{ marginBottom: 12 }}>
                      <Input value={scene.title} onChange={(e) => handleSceneChange(index, "title", e.target.value)} disabled={!canEdit} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Subtitle" style={{ marginBottom: 12 }}>
                      <Input value={scene.subtitle} onChange={(e) => handleSceneChange(index, "subtitle", e.target.value)} disabled={!canEdit} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Duration (seconds)" style={{ marginBottom: 12 }}>
                      <InputNumber min={1} max={60} value={scene.duration} onChange={(val) => handleSceneChange(index, "duration", val)} disabled={!canEdit} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Background Color" style={{ marginBottom: 12 }}>
                      <Input value={scene.backgroundColor} onChange={(e) => handleSceneChange(index, "backgroundColor", e.target.value)} disabled={!canEdit} />
                    </Form.Item>
                  </Col>

                  <Divider style={{ margin: "16px 0" }} />

                  {/* Animation */}
                  <Col span={24}>
                    <Title level={5}><SettingOutlined /> Animation</Title>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="Transition" style={{ marginBottom: 12 }}>
                      <Select value={scene.transition} onChange={(val) => handleSceneChange(index, "transition", val)} options={TRANSITION_OPTIONS} disabled={!canEdit} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="Camera Motion" style={{ marginBottom: 12 }}>
                      <Select value={scene.cameraMotion} onChange={(val) => handleSceneChange(index, "cameraMotion", val)} options={CAMERA_OPTIONS} disabled={!canEdit} />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={8}>
                    <Form.Item label="Animation" style={{ marginBottom: 12 }}>
                      <Input value={scene.animation || ""} onChange={(e) => handleSceneChange(index, "animation", e.target.value)} disabled={!canEdit} placeholder="e.g., fadeIn, slideUp" />
                    </Form.Item>
                  </Col>

                  <Divider style={{ margin: "16px 0" }} />

                  {/* Image */}
                  <Col span={24}>
                    <Title level={5}><PictureOutlined /> Image</Title>
                  </Col>
                  <Col span={24}>
                    <Form.Item label="Image Prompt" style={{ marginBottom: 12 }}>
                      <TextArea rows={2} value={scene.imagePrompt} onChange={(e) => handleSceneChange(index, "imagePrompt", e.target.value)} disabled={!canEdit} placeholder="AI image generation prompt (only for image scenes)" />
                    </Form.Item>
                  </Col>

                  <Divider style={{ margin: "16px 0" }} />

                  {/* Audio */}
                  <Col span={24}>
                    <Title level={5}><TranslationOutlined /> Audio / Narration</Title>
                  </Col>
                  <Col span={24}>
                    <Form.Item label="Narration Text" style={{ marginBottom: 12 }}>
                      <TextArea rows={2} value={scene.audio?.text || ""} onChange={(e) => handleAudioTextChange(index, e.target.value)} disabled={!canEdit} placeholder="Text to speak in this scene" />
                    </Form.Item>
                  </Col>
                </Row>
              </Card>
            </Collapse.Panel>
          ))}
        </Collapse>
      )}
    </div>
  );
};

export default StudioPage;