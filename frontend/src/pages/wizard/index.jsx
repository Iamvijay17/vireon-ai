import React, { useState } from "react";
import {
  Typography, Card, Form, Input, Select, Button, Steps, Result, Descriptions, Tag, Spin, message
} from "antd";
import {
  VideoCameraOutlined, AudioOutlined, FileTextOutlined, CheckCircleOutlined,
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
  { value: "english", label: "English" }
];

const STEPS = [
  { title: "Topic & Type", icon: <FileTextOutlined /> },
  { title: "Voice & Language", icon: <AudioOutlined /> },
  { title: "Resolution", icon: <VideoCameraOutlined /> },
  { title: "Done", icon: <CheckCircleOutlined /> },
];

const Wizard = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fieldValues, setFieldValues] = useState({});

  const handleNext = async () => {
    // Validate only the fields for the current step
    try {
      const fieldsToValidate = [];
      if (current === 0) {
        fieldsToValidate.push("topic", "type", "language");
      } else if (current === 1) {
        fieldsToValidate.push("voice");
      } else if (current === 2) {
        fieldsToValidate.push("resolution", "aspectRatio");
      }
      await form.validateFields(fieldsToValidate);
      // Save current values
      const allValues = form.getFieldsValue();
      setFieldValues(allValues);
      setCurrent((prev) => prev + 1);
    } catch {
      // Validation failed - form will show errors
    }
  };

  const handleBack = () => {
    const allValues = form.getFieldsValue();
    setFieldValues(allValues);
    setCurrent((prev) => prev - 1);
  };

  const handleSubmit = async () => {
    try {
      const allValues = form.getFieldsValue();
      setLoading(true);
      setFieldValues(allValues);

      console.log("Submitting payload:", allValues);

      const res = await createVideoJob(allValues);
      setResult(res.data);
      message.success("Video job created! Processing started.");
      setCurrent(3);
    } catch (err) {
      const errMsg = err?.response?.data?.error || err?.response?.data?.details?.[0]?.message || "Failed to create job";
      message.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24, color: colors.textPrimary }}>
        Create Video
      </Title>

      <Steps current={current} style={{ marginBottom: 48, maxWidth: 700 }}>
        {STEPS.map((s) => ({ title: s.title, icon: s.icon }))}
      </Steps>

      <Card style={{ borderRadius: 12, minHeight: 420 }}>
        {current < 3 && (
          <Form
            form={form}
            layout="vertical"
            size="large"
            initialValues={{
              language: "english",
              voice: "female-1",
              resolution: "1920x1080",
              aspectRatio: "16:9",
              ...fieldValues,
            }}
          >
            {/* ── Step 1: Topic & Type ──────────────────────────────────────── */}
            <div style={{ maxWidth: 560, margin: "0 auto", display: current === 0 ? "block" : "none" }}>
              <Title level={5} style={{ marginBottom: 24 }}>What do you want to create?</Title>

              <Form.Item
                name="topic"
                label="Video Topic"
                rules={[
                  { required: true, message: "Please enter a topic" },
                  { min: 3, message: "At least 3 characters" },
                ]}
              >
                <Input.TextArea
                  rows={3}
                  placeholder="e.g., Introduction to Quantum Computing, The Future of AI, How to Start a Business..."
                />
              </Form.Item>

              <Form.Item
                name="type"
                label="Video Type"
                rules={[{ required: true, message: "Please select a type" }]}
              >
                <Select placeholder="Select video type" options={VIDEO_TYPES} showSearch />
              </Form.Item>

              <Form.Item name="language" label="Language">
                <Select options={LANGUAGES} />
              </Form.Item>

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 32 }}>
                <Button type="primary" onClick={handleNext} icon={<ArrowRightOutlined />}>
                  Next
                </Button>
              </div>
            </div>

            {/* ── Step 2: Voice & Language ──────────────────────────────────── */}
            <div style={{ maxWidth: 560, margin: "0 auto", display: current === 1 ? "block" : "none" }}>
              <Title level={5} style={{ marginBottom: 24 }}>Configure audio settings</Title>

              <Form.Item name="voice" label="Voice">
                <Select options={VOICES} />
              </Form.Item>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32 }}>
                <Button onClick={handleBack} icon={<ArrowLeftOutlined />}>
                  Back
                </Button>
                <Button type="primary" onClick={handleNext} icon={<ArrowRightOutlined />}>
                  Next
                </Button>
              </div>
            </div>

            {/* ── Step 3: Resolution ─────────────────────────────────────────── */}
            <div style={{ maxWidth: 560, margin: "0 auto", display: current === 2 ? "block" : "none" }}>
              <Title level={5} style={{ marginBottom: 24 }}>Choose output quality</Title>

              <Form.Item name="resolution" label="Resolution">
                <Select options={RESOLUTIONS} />
              </Form.Item>

              <Form.Item name="aspectRatio" label="Aspect Ratio">
                <Select options={ASPECT_RATIOS} />
              </Form.Item>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32 }}>
                <Button onClick={handleBack} icon={<ArrowLeftOutlined />}>
                  Back
                </Button>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleSubmit}
                  loading={loading}
                  size="large"
                >
                  Create Video
                </Button>
              </div>
            </div>
          </Form>
        )}

        {/* ── Step 4: Result ─────────────────────────────────────────────────── */}
        {current === 3 && result && (
          <Result
            status="success"
            title="Video Job Created!"
            subTitle="Your video has been queued for processing. You can monitor its progress in real-time."
            extra={[
              <Button type="primary" key="view" onClick={() => navigate(`/render?id=${result.jobId}`)}>
                View Progress
              </Button>,
              <Button key="new" onClick={() => { setResult(null); setCurrent(0); form.resetFields(); setFieldValues({}); }}>
                Create Another
              </Button>,
              <Button key="dashboard" onClick={() => navigate("/")}>
                Back to Dashboard
              </Button>,
            ]}
          >
            <Descriptions column={1} bordered size="small" style={{ maxWidth: 400, margin: "24px auto 0" }}>
              <Descriptions.Item label="Job ID">
                <Text copyable>{result.jobId}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag icon={<RocketOutlined />} color="processing">{result.status}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </Result>
        )}

        {current === 3 && !result && (
          <div style={{ textAlign: "center", padding: 80 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: colors.textSecondary }}>Creating your video job...</div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Wizard;
