import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  Card,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Modal,
  Form,
  message,
  Typography,
  Row,
  Col,
  Progress,
  Empty,
  Spin,
  Tooltip,
  List,
  Divider,
  Descriptions,
  Badge,
  Dropdown,
} from 'antd';
import {
  PlusOutlined,
  ArrowLeftOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  FileTextOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { ThemeContext } from '../../shared/ThemeContext';
import { getColors, typography } from '../../shared/theme';
import {
  getCourse,
  updateCourse,
  deleteCourse,
  getCourseVideos,
  createCourseVideo,
  deleteCourseVideo,
} from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

const videoStatusColors = {
  'Draft': 'default',
  'Generating Script': 'processing',
  'Script Generated': 'blue',
  'Waiting for Approval': 'warning',
  'Approved': 'purple',
  'Generating Audio': 'processing',
  'Audio Generated': 'cyan',
  'Generating Scenes': 'processing',
  'Scenes Generated': 'geekblue',
  'Generating Images': 'processing',
  'Images Generated': 'orange',
  'Rendering Video': 'processing',
  'Completed': 'success',
  'Failed': 'error',
};

const videoStatusIcons = {
  'Draft': <FileTextOutlined />,
  'Generating Script': <FileTextOutlined />,
  'Script Generated': <FileTextOutlined />,
  'Waiting for Approval': <FileTextOutlined />,
  'Approved': <CheckCircleOutlined />,
  'Generating Audio': <SoundOutlined />,
  'Audio Generated': <SoundOutlined />,
  'Rendering Video': <VideoCameraOutlined />,
  'Completed': <CheckCircleOutlined />,
  'Failed': <ClockCircleOutlined />,
};

const CourseDetail = () => {
  const { theme } = useContext(ThemeContext);
  const dynamicColors = getColors(theme);
  const { id } = useParams();
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  const [videos, setVideos] = useState([]);
  const [videoStatusSummary, setVideoStatusSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchCourse = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCourse(id);
      setCourse(res.data.course);
      setVideoStatusSummary(res.data.videoStatusSummary || {});
    } catch (err) {
      message.error('Failed to load course');
      navigate('/courses');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  const fetchVideos = useCallback(async () => {
    setVideosLoading(true);
    try {
      const res = await getCourseVideos(id);
      setVideos(res.data.videos);
    } catch (err) {
      message.error('Failed to load videos');
    } finally {
      setVideosLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCourse();
    fetchVideos();
  }, [fetchCourse, fetchVideos]);

  const showCreateModal = () => {
    form.resetFields();
    setModalVisible(true);
  };

  const handleCreateVideo = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await createCourseVideo(id, values);
      message.success('Video created successfully');
      setModalVisible(false);
      form.resetFields();
      fetchVideos();
      fetchCourse();
    } catch (err) {
      if (err.errorFields) return;
      message.error(err.response?.data?.message || 'Failed to create video');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVideo = (video) => {
    Modal.confirm({
      title: 'Delete Video',
      content: `Are you sure you want to delete "${video.title}"?`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteCourseVideo(video._id);
          message.success('Video deleted');
          fetchVideos();
          fetchCourse();
        } catch (err) {
          message.error('Failed to delete video');
        }
      },
    });
  };

  const handleDeleteCourse = () => {
    Modal.confirm({
      title: 'Delete Course',
      content: `Are you sure you want to delete "${course?.title}"? All videos will be deleted.`,
      okText: 'Delete',
      okType: 'danger',
      onOk: async () => {
        try {
          await deleteCourse(id);
          message.success('Course deleted');
          navigate('/courses');
        } catch (err) {
          message.error('Failed to delete course');
        }
      },
    });
  };

  const totalVideos = course?.videoCount || 0;
  const completedVideos = course?.completedVideoCount || 0;
  const progressPercent = totalVideos > 0 ? Math.round((completedVideos / totalVideos) * 100) : 0;

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Space>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => navigate('/courses')}
              type="text"
            />
            <div>
              <Title level={3} style={{ margin: 0, color: dynamicColors.text }}>
                {course?.title}
              </Title>
              <Text style={{ color: dynamicColors.textSecondary }}>
                {course?.description || 'No description'}
              </Text>
            </div>
          </Space>
        </Col>
        <Col>
          <Space>
            <Button icon={<PlusOutlined />} type="primary" onClick={showCreateModal}>
              Create Video
            </Button>
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'edit',
                    icon: <EditOutlined />,
                    label: 'Edit Course',
                    onClick: () => navigate(`/courses/${id}/edit`),
                  },
                  {
                    key: 'delete',
                    icon: <DeleteOutlined />,
                    label: 'Delete Course',
                    danger: true,
                    onClick: handleDeleteCourse,
                  },
                ],
              }}
            >
              <Button icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        </Col>
      </Row>

      {/* Course Info */}
      <Card
        style={{
          marginBottom: 16,
          background: dynamicColors.surface,
          borderColor: dynamicColors.borderLight,
        }}
      >
        <Row gutter={24} align="middle">
          <Col span={12}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Category">{course?.category}</Descriptions.Item>
              <Descriptions.Item label="Difficulty">{course?.difficulty}</Descriptions.Item>
              <Descriptions.Item label="Language">{course?.language}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag>{course?.status}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Col>
          <Col span={12}>
            <div style={{ textAlign: 'center' }}>
              <Progress
                type="circle"
                percent={progressPercent}
                size={80}
                format={() => `${completedVideos}/${totalVideos}`}
              />
              <div style={{ marginTop: 8 }}>
                <Text style={{ color: dynamicColors.textSecondary }}>
                  {completedVideos} of {totalVideos} videos completed
                </Text>
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Video Status Summary */}
      <Row gutter={[8, 8]} style={{ marginBottom: 16 }}>
        {Object.entries(videoStatusSummary).map(([status, count]) => (
          <Col key={status}>
            <Badge
              count={count}
              style={{ backgroundColor: videoStatusColors[status] === 'processing' ? '#1890ff' : undefined }}
            >
              <Tag color={videoStatusColors[status]} style={{ padding: '4px 12px' }}>
                {status}
              </Tag>
            </Badge>
          </Col>
        ))}
      </Row>

      {/* Videos List */}
      <Card
        title={
          <Space>
            <VideoCameraOutlined />
            <span>Videos</span>
          </Space>
        }
        style={{
          background: dynamicColors.surface,
          borderColor: dynamicColors.borderLight,
        }}
      >
        <List
          loading={videosLoading}
          dataSource={videos}
          locale={{
            emptyText: (
              <Empty description="No videos yet" image={Empty.PRESENTED_IMAGE_SIMPLE}>
                <Button type="primary" onClick={showCreateModal}>
                  Create Your First Video
                </Button>
              </Empty>
            ),
          }}
          renderItem={(video) => (
            <List.Item
              style={{
                borderColor: dynamicColors.borderLight,
                cursor: 'pointer',
              }}
              onClick={() => navigate(`/courses/${id}/videos/${video._id}`)}
              actions={[
                <Tooltip title="Open Video">
                  <Button
                    type="text"
                    icon={<PlayCircleOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/courses/${id}/videos/${video._id}`);
                    }}
                  />
                </Tooltip>,
                <Tooltip title="Delete">
                  <Button
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteVideo(video);
                    }}
                  />
                </Tooltip>,
              ]}
            >
              <List.Item.Meta
                avatar={
                  <Tag
                    icon={videoStatusIcons[video.status]}
                    color={videoStatusColors[video.status]}
                    style={{ padding: '4px 8px', fontSize: 12 }}
                  >
                    {video.status}
                  </Tag>
                }
                title={
                  <Space>
                    <Text strong style={{ color: dynamicColors.text }}>
                      {video.order + 1}. {video.title}
                    </Text>
                  </Space>
                }
                description={
                  <Space size="small" style={{ color: dynamicColors.textSecondary }}>
                    <Text type="secondary">{video.duration} min</Text>
                    <Text type="secondary">•</Text>
                    <Text type="secondary">{video.topic?.substring(0, 60)}</Text>
                    {video.audioDuration > 0 && (
                      <>
                        <Text type="secondary">•</Text>
                        <Text type="secondary">{Math.round(video.audioDuration)}s audio</Text>
                      </>
                    )}
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      {/* Create Video Modal */}
      <Modal
        title="Create Video"
        open={modalVisible}
        onOk={handleCreateVideo}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
        }}
        confirmLoading={submitting}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            duration: 5,
            voice: 'female-1',
            style: 'educational',
          }}
        >
          <Form.Item
            name="title"
            label="Video Title"
            rules={[{ required: true, message: 'Please enter a video title' }]}
          >
            <Input placeholder="e.g., Introduction to React" />
          </Form.Item>
          <Form.Item
            name="topic"
            label="Topic"
            rules={[{ required: true, message: 'Please enter a topic' }]}
          >
            <TextArea
              rows={2}
              placeholder="e.g., Explain React from scratch for beginners."
            />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="duration" label="Duration">
                <Select
                  options={[
                    { value: 5, label: '5 minutes' },
                    { value: 10, label: '10 minutes' },
                    { value: 15, label: '15 minutes' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="voice" label="Voice">
                <Select
                  options={[
                    { value: 'male-1', label: 'Male 1' },
                    { value: 'male-2', label: 'Male 2' },
                    { value: 'female-1', label: 'Female 1' },
                    { value: 'female-2', label: 'Female 2' },
                    { value: 'neutral-1', label: 'Neutral' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="style" label="Style">
                <Select
                  options={[
                    { value: 'educational', label: 'Educational' },
                    { value: 'story', label: 'Story' },
                    { value: 'motivational', label: 'Motivational' },
                    { value: 'business', label: 'Business' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="additionalInstructions" label="Additional Instructions (optional)">
            <TextArea rows={2} placeholder="Any specific instructions for the AI..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CourseDetail;