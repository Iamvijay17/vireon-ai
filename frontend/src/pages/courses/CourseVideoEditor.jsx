import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Modal,
  message,
  Typography,
  Row,
  Col,
  Spin,
  Steps,
  Descriptions,
  Alert,
  Input,
  Progress,
  Tooltip,
  Empty,
  Result,
  Timeline,
  List,
  Collapse,
} from 'antd';
import {
  ArrowLeftOutlined,
  FileTextOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  EditOutlined,
  ThunderboltOutlined,
  LoadingOutlined,
  RobotOutlined,
  AudioOutlined,
  StepForwardOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { ThemeContext } from '../../shared/ThemeContext';
import { getColors } from '../../shared/theme';
import {
  getCourseVideo,
  generateCourseVideoScript,
  approveCourseVideoScript,
  updateCourseVideoScript,
  regenerateCourseVideoScript,
  generateCourseVideoAudio,
  renderCourseVideo,
  retryCourseVideo,
} from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

const getCurrentStep = (status) => {
  const stepMap = {
    'Draft': 0,
    'Generating Script': 0,
    'Script Generated': 1,
    'Waiting for Approval': 1,
    'Approved': 1,
    'Generating Audio': 2,
    'Audio Generated': 2,
    'Generating Scenes': 2,
    'Scenes Generated': 2,
    'Generating Images': 2,
    'Images Generated': 2,
    'Rendering Video': 3,
    'Completed': 4,
    'Failed': -1,
  };
  return stepMap[status] ?? 0;
};

const CourseVideoEditor = () => {
  const { theme } = useContext(ThemeContext);
  const dynamicColors = getColors(theme);
  const { courseId, videoId } = useParams();
  const navigate = useNavigate();
  const pollingRef = useRef(null);

  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [editingScript, setEditingScript] = useState(false);
  const [scriptText, setScriptText] = useState('');
  const [activityLog, setActivityLog] = useState([]);
  const [parsedScript, setParsedScript] = useState(null);

  const setStepLoading = (step, val) => {
    setActionLoading((prev) => ({ ...prev, [step]: val }));
  };

  const fetchVideo = useCallback(async () => {
    try {
      const res = await getCourseVideo(videoId);
      const v = res.data.video;
      setVideo(v);
      setScriptText(v.script || '');

      // Parse script to extract scenes
      if (v.script) {
        try {
          const parsed = JSON.parse(v.script);
          setParsedScript(parsed);
        } catch {
          setParsedScript(null);
        }
      } else {
        setParsedScript(null);
      }

      addActivity(`Status: ${v.status}`, v.updatedAt);
    } catch (err) {
      message.error('Failed to load video');
      navigate(`/courses/${courseId}`);
    } finally {
      setLoading(false);
    }
  }, [videoId, courseId, navigate]);

  useEffect(() => {
    fetchVideo();
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [fetchVideo]);

  const addActivity = (text, timestamp) => {
    setActivityLog((prev) => [
      { text, time: timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString() },
      ...prev,
    ]);
  };

  const startPolling = (step) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    pollingRef.current = setInterval(async () => {
      try {
        const res = await getCourseVideo(videoId);
        const updated = res.data.video;
        setVideo(updated);
        setScriptText(updated.script || '');

        if (updated.script) {
          try {
            const parsed = JSON.parse(updated.script);
            setParsedScript(parsed);
          } catch {
            setParsedScript(null);
          }
        }

        // Stop polling when terminal state reached
        if (['Completed', 'Failed', 'Script Generated', 'Audio Generated'].includes(updated.status)) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setStepLoading(step, false);
          addActivity(`Status updated: ${updated.status}`, updated.updatedAt);
        }
      } catch {
        // Ignore polling errors
      }
    }, 2000);
  };

  const handleGenerateScript = async () => {
    setStepLoading('script', true);
    try {
      await generateCourseVideoScript(videoId);
      message.info('Script generation started');
      addActivity('Script generation started');
      startPolling('script');
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to start script generation');
      setStepLoading('script', false);
    }
  };

  const handleApproveScript = async () => {
    setStepLoading('approve', true);
    try {
      await approveCourseVideoScript(videoId);
      message.success('Script approved');
      addActivity('Script approved');
      fetchVideo();
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to approve script');
    } finally {
      setStepLoading('approve', false);
    }
  };

  const handleSaveScript = async () => {
    setStepLoading('save', true);
    try {
      await updateCourseVideoScript(videoId, scriptText);
      message.success('Script updated');
      setEditingScript(false);
      addActivity('Script edited and saved');
      fetchVideo();
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to save script');
    } finally {
      setStepLoading('save', false);
    }
  };

  const handleRegenerateScript = async () => {
    Modal.confirm({
      title: 'Regenerate Script',
      content: 'This will replace the current script. Are you sure?',
      onOk: async () => {
        setStepLoading('script', true);
        try {
          await regenerateCourseVideoScript(videoId);
          message.info('Script regeneration started');
          addActivity('Script regeneration started');
          startPolling('script');
        } catch (err) {
          message.error(err.response?.data?.message || 'Failed to regenerate script');
          setStepLoading('script', false);
        }
      },
    });
  };

  const handleGenerateAudio = async () => {
    setStepLoading('audio', true);
    try {
      await generateCourseVideoAudio(videoId);
      message.info('Audio generation started');
      addActivity('Audio generation started');
      startPolling('audio');
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to start audio generation');
      setStepLoading('audio', false);
    }
  };

  const handleRegenerateAudio = async () => {
    Modal.confirm({
      title: 'Regenerate Audio',
      content: 'This will regenerate all audio for this video. Are you sure?',
      onOk: async () => {
        setStepLoading('audio', true);
        try {
          await generateCourseVideoAudio(videoId);
          message.info('Audio regeneration started');
          addActivity('Audio regeneration started');
          startPolling('audio');
        } catch (err) {
          message.error(err.response?.data?.message || 'Failed to regenerate audio');
          setStepLoading('audio', false);
        }
      },
    });
  };

  const handleRender = async () => {
    setStepLoading('render', true);
    try {
      await renderCourseVideo(videoId);
      message.info('Rendering started');
      addActivity('Rendering started');
      startPolling('render');
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to start rendering');
      setStepLoading('render', false);
    }
  };

  const handleReRender = async () => {
    Modal.confirm({
      title: 'Re-Render Video',
      content: 'This will re-render the video from scratch. Are you sure?',
      onOk: async () => {
        setStepLoading('render', true);
        try {
          await renderCourseVideo(videoId);
          message.info('Re-rendering started');
          addActivity('Re-rendering started');
          startPolling('render');
        } catch (err) {
          message.error(err.response?.data?.message || 'Failed to re-render');
          setStepLoading('render', false);
        }
      },
    });
  };

  const handleRetry = async () => {
    const failedStep = video?.error?.step || 'Script Generation';
    setStepLoading('retry', true);
    try {
      await retryCourseVideo(videoId);
      message.info(`Retrying ${failedStep}...`);
      addActivity(`Retrying ${failedStep}...`);
      startPolling('retry');
    } catch (err) {
      message.error(err.response?.data?.message || 'Failed to retry');
      setStepLoading('retry', false);
    }
  };

  // Compute derived state
  const isProcessing = ['Generating Script', 'Generating Audio', 'Rendering Video', 'Generating Scenes', 'Generating Images'].includes(video?.status);
  const isFailed = video?.status === 'Failed';
  const isCompleted = video?.status === 'Completed';
  const hasScript = video?.script && video.script.length > 0;
  const isApproved = video?.approved;
  const hasAudio = video?.audioUrl && video.audioUrl.length > 0;
  const hasRender = video?.renderUrl && video.renderUrl.length > 0;
  const scenes = parsedScript?.scenes || [];

  // Compute audio URL base
  const audioBaseUrl = video?._id ? `/public/${video._id}/audio` : null;

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!video) {
    return (
      <Result
        status="404"
        title="Video not found"
        extra={
          <Button type="primary" onClick={() => navigate(`/courses/${courseId}`)}>
            Back to Course
          </Button>
        }
      />
    );
  }

  const currentStep = getCurrentStep(video.status);

  return (
    <div>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate(`/courses/${courseId}`)}
              type="text"
            />
            <div>
              <Title level={3} style={{ margin: 0, color: dynamicColors.text }}>
                {video.title}
              </Title>
              <Text style={{ color: dynamicColors.textSecondary }}>
                {video.topic}
              </Text>
            </div>
          </Space>
        </Col>
        <Col>
          <Space>
            {isFailed && (
              <Button
                icon={<ReloadOutlined />}
                onClick={handleRetry}
                loading={actionLoading['retry']}
              >
                Retry
              </Button>
            )}
            {isProcessing && (
              <Tag icon={<LoadingOutlined />} color="processing">
                {video.status}
              </Tag>
            )}
            {isCompleted && (
              <Tag icon={<CheckCircleOutlined />} color="success">
                Completed
              </Tag>
            )}
          </Space>
        </Col>
      </Row>

      {/* Progress Steps */}
      <Card
        style={{
          marginBottom: 16,
          background: dynamicColors.surface,
          borderColor: dynamicColors.borderLight,
        }}
      >
        <Steps
          current={currentStep}
          status={isFailed ? 'error' : 'process'}
          items={[
            { title: 'Draft', icon: <FileTextOutlined /> },
            {
              title: 'Script',
              icon: <RobotOutlined />,
              status: currentStep >= 1 ? 'finish' : 'wait',
              subTitle: isApproved ? 'Approved' : hasScript ? 'Ready' : '',
            },
            {
              title: 'Audio',
              icon: <AudioOutlined />,
              status: currentStep >= 2 ? 'finish' : 'wait',
              subTitle: hasAudio ? `${Math.round(video.audioDuration)}s` : '',
            },
            {
              title: 'Render',
              icon: <VideoCameraOutlined />,
              status: currentStep >= 3 ? 'finish' : 'wait',
            },
            {
              title: 'Complete',
              icon: <CheckCircleOutlined />,
              status: currentStep >= 4 ? 'finish' : 'wait',
            },
          ]}
        />
      </Card>

      {/* Video Info */}
      <Card
        style={{
          marginBottom: 16,
          background: dynamicColors.surface,
          borderColor: dynamicColors.borderLight,
        }}
      >
        <Descriptions column={4} size="small">
          <Descriptions.Item label="Duration">{video.duration} min</Descriptions.Item>
          <Descriptions.Item label="Voice">{video.voice}</Descriptions.Item>
          <Descriptions.Item label="Style">{video.style}</Descriptions.Item>
          <Descriptions.Item label="Status">
            <Tag color={
              isCompleted ? 'success' : isFailed ? 'error' : isProcessing ? 'processing' : 'default'
            }>
              {video.status}
            </Tag>
          </Descriptions.Item>
        </Descriptions>
        {video.additionalInstructions && (
          <div style={{ marginTop: 8 }}>
            <Text type="secondary">Instructions: {video.additionalInstructions}</Text>
          </div>
        )}
      </Card>

      {/* Error Alert */}
      {isFailed && video.error?.message && (
        <Alert
          type="error"
          message={`Failed at: ${video.error.step || 'Unknown'}`}
          description={video.error.message}
          showIcon
          closable
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={handleRetry} loading={actionLoading['retry']}>
              Retry
            </Button>
          }
        />
      )}

      {/* Processing Progress */}
      {isProcessing && (
        <Card
          style={{
            marginBottom: 16,
            background: dynamicColors.surface,
            borderColor: dynamicColors.borderLight,
          }}
        >
          <Space>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} />} />
            <div>
              <Text strong>{video.status}</Text>
              {video.renderProgress > 0 && (
                <Progress percent={video.renderProgress} size="small" style={{ width: 200 }} />
              )}
            </div>
          </Space>
        </Card>
      )}

      <Row gutter={16}>
        {/* Left Column */}
        <Col span={16}>
          {/* ── STEP 1: SCRIPT ─────────────────────────────────────────── */}
          <Card
            title={
              <Space>
                <StepForwardOutlined />
                <span>Step 1: Script Generation</span>
                {hasScript && !isApproved && (
                  <Tag color="warning">Needs Approval</Tag>
                )}
                {isApproved && (
                  <Tag icon={<CheckCircleOutlined />} color="success">Approved</Tag>
                )}
                {isCompleted && (
                  <Tag icon={<CheckCircleOutlined />} color="success">Done</Tag>
                )}
              </Space>
            }
            style={{
              marginBottom: 16,
              background: dynamicColors.surface,
              borderColor: dynamicColors.borderLight,
            }}
            extra={
              <Space>
                {!hasScript && !isProcessing && (
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={handleGenerateScript}
                    loading={actionLoading['script']}
                  >
                    Generate Script
                  </Button>
                )}
                {hasScript && !isApproved && !isProcessing && (
                  <>
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => setEditingScript(!editingScript)}
                    >
                      {editingScript ? 'Cancel' : 'Edit'}
                    </Button>
                    <Button
                      type="primary"
                      icon={<CheckCircleOutlined />}
                      onClick={handleApproveScript}
                      loading={actionLoading['approve']}
                    >
                      Approve Script
                    </Button>
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={handleRegenerateScript}
                      loading={actionLoading['script']}
                    >
                      Regenerate
                    </Button>
                  </>
                )}
                {isApproved && !isProcessing && (
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={handleRegenerateScript}
                    loading={actionLoading['script']}
                  >
                    Regenerate Script
                  </Button>
                )}
              </Space>
            }
          >
            {!hasScript && !isProcessing && (
              <Empty
                description="No script yet"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={handleGenerateScript}
                  loading={actionLoading['script']}
                >
                  Generate Script with AI
                </Button>
              </Empty>
            )}
            {!hasScript && video?.status === 'Generating Script' && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
                <div style={{ marginTop: 16 }}>
                  <Text>Generating script using AI...</Text>
                </div>
              </div>
            )}
            {hasScript && !editingScript && (
              <Collapse
                defaultActiveKey={['preview']}
                items={[
                  {
                    key: 'preview',
                    label: `Script Preview (${scenes.length} scenes)`,
                    children: (
                      <pre
                        style={{
                          background: dynamicColors.bg,
                          padding: 16,
                          borderRadius: 8,
                          maxHeight: 400,
                          overflow: 'auto',
                          fontSize: 13,
                          lineHeight: 1.6,
                          color: dynamicColors.text,
                          border: `1px solid ${dynamicColors.borderLight}`,
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'monospace',
                        }}
                      >
                        {(() => {
                          try {
                            const parsed = JSON.parse(video.script);
                            return JSON.stringify(parsed, null, 2);
                          } catch {
                            return video.script;
                          }
                        })()}
                      </pre>
                    ),
                  },
                ]}
              />
            )}
            {hasScript && editingScript && (
              <div>
                <TextArea
                  rows={15}
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  style={{
                    fontFamily: 'monospace',
                    fontSize: 13,
                    background: dynamicColors.bg,
                    color: dynamicColors.text,
                    borderColor: dynamicColors.borderLight,
                  }}
                />
                <div style={{ marginTop: 12, textAlign: 'right' }}>
                  <Space>
                    <Button onClick={() => {
                      setEditingScript(false);
                      setScriptText(video.script);
                    }}>
                      Cancel
                    </Button>
                    <Button
                      type="primary"
                      onClick={handleSaveScript}
                      loading={actionLoading['save']}
                    >
                      Save Script
                    </Button>
                  </Space>
                </div>
              </div>
            )}
          </Card>

          {/* ── STEP 2: AUDIO ──────────────────────────────────────────── */}
          <Card
            title={
              <Space>
                <StepForwardOutlined />
                <span>Step 2: Audio Generation</span>
                {hasAudio && (
                  <Tag icon={<CheckCircleOutlined />} color="success">Generated ({Math.round(video.audioDuration)}s)</Tag>
                )}
              </Space>
            }
            style={{
              marginBottom: 16,
              background: dynamicColors.surface,
              borderColor: dynamicColors.borderLight,
            }}
            extra={
              <Space>
                {isApproved && !hasAudio && !isProcessing && (
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={handleGenerateAudio}
                    loading={actionLoading['audio']}
                  >
                    Generate Audio
                  </Button>
                )}
                {hasAudio && !isProcessing && (
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={handleRegenerateAudio}
                    loading={actionLoading['audio']}
                  >
                    Regenerate Audio
                  </Button>
                )}
              </Space>
            }
          >
            {!isApproved && !hasAudio && (
              <Empty
                description="Approve the script first to generate audio"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
            {isApproved && !hasAudio && !isProcessing && (
              <Empty
                description="Audio not yet generated"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={handleGenerateAudio}
                  loading={actionLoading['audio']}
                >
                  Generate Audio
                </Button>
              </Empty>
            )}
            {video?.status === 'Generating Audio' && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
                <div style={{ marginTop: 16 }}>
                  <Text>Generating audio narration...</Text>
                </div>
              </div>
            )}
            {hasAudio && scenes.length > 0 && (
              <div>
                <Text strong style={{ marginBottom: 12, display: 'block' }}>
                  Per-Scene Audio ({scenes.length} scenes)
                </Text>
                <List
                  dataSource={scenes}
                  renderItem={(scene, idx) => {
                    const sceneNum = scene.sceneNumber || idx + 1;
                    const sceneAudioUrl = `${audioBaseUrl}/scene${sceneNum}.mp3`;
                    const narrationText = scene.audio?.text || scene.title || '';
                    const sceneTitle = scene.title || `Scene ${sceneNum}`;
                    const sceneType = scene.sceneType || 'content';

                    return (
                      <List.Item
                        style={{
                          borderColor: dynamicColors.borderLight,
                          padding: '12px 0',
                        }}
                      >
                        <div style={{ width: '100%' }}>
                          <Space style={{ marginBottom: 8 }}>
                            <Tag>{sceneType}</Tag>
                            <Text strong>{sceneNum}. {sceneTitle}</Text>
                          </Space>
                          <div style={{ marginBottom: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {narrationText.substring(0, 120)}{narrationText.length > 120 ? '...' : ''}
                            </Text>
                          </div>
                          <audio
                            controls
                            style={{ width: '100%', height: 36 }}
                            preload="none"
                          >
                            <source src={sceneAudioUrl} type="audio/mpeg" />
                            Your browser does not support the audio element.
                          </audio>
                        </div>
                      </List.Item>
                    );
                  }}
                />
              </div>
            )}
            {hasAudio && scenes.length === 0 && (
              <div>
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="Total Duration">
                    {Math.round(video.audioDuration)} seconds
                  </Descriptions.Item>
                  <Descriptions.Item label="Generated">
                    {video.audioGeneratedAt ? new Date(video.audioGeneratedAt).toLocaleString() : 'N/A'}
                  </Descriptions.Item>
                </Descriptions>
                {video.audioUrl && (
                  <div style={{ marginTop: 12 }}>
                    <audio controls style={{ width: '100%' }} src={video.audioUrl}>
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* ── STEP 3: RENDER ─────────────────────────────────────────── */}
          <Card
            title={
              <Space>
                <StepForwardOutlined />
                <span>Step 3: Video Render</span>
                {isCompleted && (
                  <Tag icon={<CheckCircleOutlined />} color="success">Completed</Tag>
                )}
              </Space>
            }
            style={{
              marginBottom: 16,
              background: dynamicColors.surface,
              borderColor: dynamicColors.borderLight,
            }}
            extra={
              <Space>
                {hasAudio && !isCompleted && !isProcessing && (
                  <Button
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={handleRender}
                    loading={actionLoading['render']}
                  >
                    Render Video
                  </Button>
                )}
                {isCompleted && !isProcessing && (
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={handleReRender}
                    loading={actionLoading['render']}
                  >
                    Re-Render
                  </Button>
                )}
              </Space>
            }
          >
            {!hasAudio && !isCompleted && (
              <Empty
                description="Generate audio first to render the video"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
            {hasAudio && !isCompleted && !isProcessing && (
              <Empty
                description="Ready to render"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button
                  type="primary"
                  icon={<ThunderboltOutlined />}
                  onClick={handleRender}
                  loading={actionLoading['render']}
                >
                  Render Video
                </Button>
              </Empty>
            )}
            {video?.status === 'Rendering Video' && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} />} />
                <div style={{ marginTop: 16 }}>
                  <Text>Rendering video...</Text>
                </div>
                {video.renderProgress > 0 && (
                  <Progress percent={video.renderProgress} style={{ marginTop: 16, maxWidth: 400 }} />
                )}
              </div>
            )}
            {isCompleted && (
              <Result
                status="success"
                title="Video Completed!"
                subTitle={`Rendered at: ${video.renderedAt ? new Date(video.renderedAt).toLocaleString() : 'N/A'}`}
                extra={[
                  video.renderUrl && (
                    <Button
                      key="watch"
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      href={video.renderUrl}
                      target="_blank"
                    >
                      Watch Video
                    </Button>
                  ),
                  <Button
                    key="rerender"
                    icon={<ReloadOutlined />}
                    onClick={handleReRender}
                    loading={actionLoading['render']}
                  >
                    Re-Render
                  </Button>,
                  <Button
                    key="back"
                    onClick={() => navigate(`/courses/${courseId}`)}
                  >
                    Back to Course
                  </Button>,
                ]}
              />
            )}
          </Card>
        </Col>

        {/* Right Column - Activity Log */}
        <Col span={8}>
          <Card
            title="Activity Log"
            style={{
              background: dynamicColors.surface,
              borderColor: dynamicColors.borderLight,
            }}
          >
            <Timeline
              items={activityLog.slice(0, 20).map((entry) => ({
                children: (
                  <div>
                    <Text style={{ color: dynamicColors.text }}>{entry.text}</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>{entry.time}</Text>
                  </div>
                ),
              }))}
            />
            {activityLog.length === 0 && (
              <Empty
                description="No activity yet"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default CourseVideoEditor;