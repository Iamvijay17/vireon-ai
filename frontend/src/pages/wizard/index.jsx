import React, { useState } from "react";
import {
  Typography, Card, Form, Input, Select, Button, Steps, Result, Descriptions, Tag, Spin, message, Space
} from "antd";
import {
  ThunderboltOutlined, VideoCameraOutlined, AudioOutlined, FileTextOutlined, CheckCircleOutlined,
  RocketOutlined, ArrowLeftOutlined, ArrowRightOutlined, SendOutlined
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { createVideoJob } from "../../services/api";
import { colors } from "../../shared/theme";

const { Title, Text } = Typography;

const VIDEO_TYPES = [
  { value: "educational", label: "Educational" },
  { value: "marketing", label: "Marketing" },
  { value: "story", label: "Story" },
  { value: "youtube_shorts", label: "YouTube Shorts" },
  { value: "podcast", label: "Podcast" },
  { value: "motivational", label: "Motivational" },
  { value: "business", label: "Business" },
];

const RESOLUTIONS = [
  { value: "1920x1080", label: "1080p (1920x1080)" },
  { value: "1080x1920", label: "1080p Vertical (1080x1920)" },
  { value: "1280x720", label: "720p (1280x720)" },
  { value: "720x1280", label: "720p Vertical (720x1280)" },
  { value: "3840x2160", label: "4K (3840x2160)" },
];

const ASPECT_RATIOS = [
  { value: "16:9", label: "16:9 (Landscape)" },
  { value: "9:16", label: "9:16 (Portrait)" },
  { value: "4:3", label: "4:3 (Standard)" },
  { value: "1:1", label: "1:1 (Square)" },
  { value: "21:9", label: "21:9 (Ultrawide)" },
];

const VOICES = [
  { value: "male-1", label: "Male Voice 1" },
  { value: "male-2", label: "Male Voice 2" },
  { value: "female-1", label: "Female Voice 1" },
  { value: "female-2", label: "Female Voice 2" },
  { value: "neutral-1", label: "Neutral Voice" },
];

const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "spanish", label: "Spanish" },
  { value: "french", label: "French" },
  { value: "german", label: "German" },
  { value: "japanese", label: "Japanese" },
  { value: "korean", label: "Korean" },
];

const Wizard = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const res = await createVideoJob(values);
      setResult(res.data);
      message.success("Video job created! Processing started.");
    } catch (err) {
      if (err.response) {
        message.error(err.response.data?.error || "Failed to create job");
      }
    } finally {
      setLoading(false);
      setCurrent(3); // Go to result step
    }
  };

  const steps = [
    {
      title: "Topic & Type",
      icon: <FileTextOutlined />,
      content: (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Title level={5} style={{ marginBottom: 24 }}>What do you want to create?</Title>
          <Form.Item
            name="topic"
            label="Video Topic"
            rules={[{ required: true, message: "Please enter a topic" }, { min: 3, message: "At least 3 characters" }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="e.g., Introduction to Quantum Computing, The Future of AI, How to Start a Business..."
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="type"
            label="Video Type"
            rules={[{ required: true, message: "Please select a type" }]}
          >
            <Select
              placeholder="Select video type"
              size="large"
              options={VIDEO_TYPES}
              showSearch
            />
          </Form.Item>

          <Form.Item
            name="language"
            label="Language"
            initialValue="english"
          >
            <Select size="large" options={LANGUAGES} />
          </Form.Item>
        </div>
      ),
    },
    {
      title: "Voice & Voice",
      icon: <AudioOutlined />,
      content: (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Title level={5} style={{ marginBottom: 24 }}>Configure audio settings</Title>

          <Form.Item
            name="voice"
            label="Voice"
            initialValue="female-1"
          >
            <Select size="large" options={VOICES} />
          </Form.Item>
        </div>
      ),
    },
    {
      title: "Resolution",
      icon: <VideoCameraOutlined />,
      content: (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <Title level={5} style={{ marginBottom: 24 }}>Choose output quality</Title>

          <Form.Item
            name="resolution"
            label="Resolution"
            initialValue="1920x1080"
          >
            <Select size="large" options={RESOLUTIONS} />
          </Form.Item>

          <Form.Item
            name="aspectRatio"
            label="Aspect Ratio"
            initialValue="16:9"
          >
            <Select size="large" options={ASPECT_RATIOS} />
          </Form.Item>
        </div>
      ),
    },
    {
      title: "Done",
      icon: <CheckCircleOutlined />,
      content: result ? (
        <Result
          status="success"
          title="Video Job Created!"
          subTitle={`Your video "${result.jobId}" has been queued for processing.`}
          extra={[
            <Button type="primary" key="view" onClick={() => navigate(`/render?id=${result.jobId}`)}>
              View Progress
            </Button>,
            <Button key="new" onClick={() => { setResult(null); setCurrent(0); form.resetFields(); }}>
              Create Another
            </Button>,
            <Button key="dashboard" onClick={() => navigate("/")}>
              Back to Dashboard
            </Button>,
          ]}
        >
          <Descriptions column={1} bordered size="small" style={{ maxWidth: 400, margin: "0 auto" }}>
            <Descriptions.Item label="Job ID">
              <Text copyable>{result.jobId}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag icon={<RocketOutlined />} color="processing">{result.status}</Tag>
            </Descriptions.Item>
          </Descriptions>
        </Result>
      ) : (
        <div style={{ textAlign: "center", padding: 48 }}>
          <Spin size="large" tip="Creating your video job..." />
        </div>
      ),
    },
  ];

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24, color: colors.textPrimary }}>
        Create Video
      </Title>

      <Steps current={current} style={{ marginBottom: 48, maxWidth: 700 }}>
        {steps.map((s) => ({
          title: s.title,
          icon: s.icon,
        }))}
      </Steps>

      <Card style={{ borderRadius: 12, minHeight: 400 }}>
        <Form
          form={form}
          layout="vertical"
          size="large"
          style={{ marginTop: 24 }}
        >
          {steps[current].content}
        </Form>

        {current < 3 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 48, maxWidth: 560, margin: "48px auto 0" }}>
            <Button
              disabled={current === 0}
              onClick={() => setCurrent((prev) => prev - 1)}
              icon={<ArrowLeftOutlined />}
            >
              Back
            </Button>
            {current < steps.length - 2 ? (
              <Button type="primary" onClick={() => setCurrent((prev) => prev + 1)} icon={<ArrowRightOutlined />}>
                Next
              </Button>
            ) : (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleSubmit}
                loading={loading}
                size="large"
              >
                Create Video
              </Button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default Wizard;
