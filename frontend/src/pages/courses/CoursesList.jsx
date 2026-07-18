import React, { useState, useEffect, useCallback, useContext } from 'react';
import {
  Card,
  Table,
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
  Statistic,
  Empty,
  Spin,
  Badge,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  BookOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  PlayCircleOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ThemeContext } from '../../shared/ThemeContext';
import { getColors, typography } from '../../shared/theme';
import {
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
} from '../../services/api';

const { Title, Text } = Typography;
const { TextArea } = Input;

const statusColors = {
  'Draft': 'default',
  'In Progress': 'processing',
  'Completed': 'success',
  'Archived': 'warning',
};

const statusIcons = {
  'Draft': <BookOutlined />,
  'In Progress': <PlayCircleOutlined />,
  'Completed': <CheckCircleOutlined />,
  'Archived': <ClockCircleOutlined />,
};

const CoursesList = () => {
  const { theme } = useContext(ThemeContext);
  const dynamicColors = getColors(theme);
  const navigate = useNavigate();

  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
  const [filters, setFilters] = useState({ search: '', status: '', category: '' });
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  const fetchCourses = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await getCourses(page, pagination.limit, filters);
      setCourses(res.data.courses);
      setPagination(res.data.pagination);
    } catch (err) {
      message.error('Failed to load courses');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.limit]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handleSearch = (value) => {
    setFilters((prev) => ({ ...prev, search: value }));
  };

  const handleStatusFilter = (value) => {
    setFilters((prev) => ({ ...prev, status: value }));
  };

  const handleCategoryFilter = (value) => {
    setFilters((prev) => ({ ...prev, category: value }));
  };

  const showCreateModal = () => {
    setEditingCourse(null);
    form.resetFields();
    setModalVisible(true);
  };

  const showEditModal = (course) => {
    setEditingCourse(course);
    form.setFieldsValue(course);
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      if (editingCourse) {
        await updateCourse(editingCourse._id, values);
        message.success('Course updated successfully');
      } else {
        await createCourse(values);
        message.success('Course created successfully');
      }

      setModalVisible(false);
      form.resetFields();
      fetchCourses();
    } catch (err) {
      if (err.errorFields) return; // validation error
      message.error(err.response?.data?.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (course) => {
    Modal.confirm({
      title: 'Delete Course',
      content: `Are you sure you want to delete "${course.title}"? All videos in this course will also be deleted.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await deleteCourse(course._id);
          message.success('Course deleted');
          fetchCourses();
        } catch (err) {
          message.error('Failed to delete course');
        }
      },
    });
  };

  const columns = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <a onClick={() => navigate(`/courses/${record._id}`)} style={{ fontWeight: 500 }}>
          {text}
        </a>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status) => (
        <Tag icon={statusIcons[status]} color={statusColors[status]}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      width: 160,
    },
    {
      title: 'Difficulty',
      dataIndex: 'difficulty',
      key: 'difficulty',
      width: 120,
    },
    {
      title: 'Videos',
      key: 'videos',
      width: 100,
      render: (_, record) => (
        <Text>
          {record.completedVideoCount || 0} / {record.videoCount || 0}
        </Text>
      ),
    },
    {
      title: 'Updated',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 180,
      render: (date) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      render: (_, record) => (
        <Space>
          <Tooltip title="Edit">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => showEditModal(record)}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }}>
        <Col>
          <Title level={3} style={{ margin: 0, color: dynamicColors.text }}>
            Courses
          </Title>
          <Text style={{ color: dynamicColors.textSecondary }}>
            Create and manage your AI-powered video courses
          </Text>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={showCreateModal} size="large">
            Create Course
          </Button>
        </Col>
      </Row>

      {/* Filters */}
      <Card
        style={{
          marginBottom: 16,
          background: dynamicColors.surface,
          borderColor: dynamicColors.borderLight,
        }}
        bodyStyle={{ padding: '16px 24px' }}
      >
        <Space wrap>
          <Input
            placeholder="Search courses..."
            prefix={<SearchOutlined />}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ width: 250 }}
            allowClear
          />
          <Select
            placeholder="Filter by status"
            onChange={handleStatusFilter}
            allowClear
            style={{ width: 160 }}
            options={[
              { value: 'Draft', label: 'Draft' },
              { value: 'In Progress', label: 'In Progress' },
              { value: 'Completed', label: 'Completed' },
              { value: 'Archived', label: 'Archived' },
            ]}
          />
          <Select
            placeholder="Filter by category"
            onChange={handleCategoryFilter}
            allowClear
            style={{ width: 200 }}
            options={[
              { value: 'Web Development', label: 'Web Development' },
              { value: 'Mobile Development', label: 'Mobile Development' },
              { value: 'Data Science', label: 'Data Science' },
              { value: 'Machine Learning', label: 'Machine Learning' },
              { value: 'DevOps', label: 'DevOps' },
              { value: 'Design', label: 'Design' },
              { value: 'Business', label: 'Business' },
              { value: 'Marketing', label: 'Marketing' },
              { value: 'Other', label: 'Other' },
            ]}
          />
        </Space>
      </Card>

      {/* Course Stats */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card style={{ background: dynamicColors.surface, borderColor: dynamicColors.borderLight }}>
            <Statistic
              title="Total Courses"
              value={pagination.total}
              prefix={<BookOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: dynamicColors.surface, borderColor: dynamicColors.borderLight }}>
            <Statistic
              title="In Progress"
              value={courses.filter((c) => c.status === 'In Progress').length}
              prefix={<PlayCircleOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: dynamicColors.surface, borderColor: dynamicColors.borderLight }}>
            <Statistic
              title="Completed"
              value={courses.filter((c) => c.status === 'Completed').length}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card style={{ background: dynamicColors.surface, borderColor: dynamicColors.borderLight }}>
            <Statistic
              title="Draft"
              value={courses.filter((c) => c.status === 'Draft').length}
              prefix={<BookOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Courses Table */}
      <Card
        style={{
          background: dynamicColors.surface,
          borderColor: dynamicColors.borderLight,
        }}
      >
        <Table
          columns={columns}
          dataSource={courses}
          rowKey="_id"
          loading={loading}
          pagination={{
            current: pagination.page,
            pageSize: pagination.limit,
            total: pagination.total,
            onChange: (page) => fetchCourses(page),
            showSizeChanger: false,
          }}
          locale={{
            emptyText: (
              <Empty
                description="No courses yet"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button type="primary" onClick={showCreateModal}>
                  Create Your First Course
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      {/* Create/Edit Modal */}
      <Modal
        title={editingCourse ? 'Edit Course' : 'Create Course'}
        open={modalVisible}
        onOk={handleModalOk}
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
            difficulty: 'Beginner',
            category: 'Other',
            language: 'english',
          }}
        >
          <Form.Item
            name="title"
            label="Course Name"
            rules={[{ required: true, message: 'Please enter a course name' }]}
          >
            <Input placeholder="e.g., React Basics" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <TextArea rows={3} placeholder="Brief description of the course" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="category" label="Category">
                <Select
                  options={[
                    { value: 'Web Development', label: 'Web Development' },
                    { value: 'Mobile Development', label: 'Mobile Development' },
                    { value: 'Data Science', label: 'Data Science' },
                    { value: 'Machine Learning', label: 'Machine Learning' },
                    { value: 'DevOps', label: 'DevOps' },
                    { value: 'Design', label: 'Design' },
                    { value: 'Business', label: 'Business' },
                    { value: 'Marketing', label: 'Marketing' },
                    { value: 'Other', label: 'Other' },
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="difficulty" label="Difficulty">
                <Select
                  options={[
                    { value: 'Beginner', label: 'Beginner' },
                    { value: 'Intermediate', label: 'Intermediate' },
                    { value: 'Advanced', label: 'Advanced' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="language" label="Language">
            <Select
              options={[
                { value: 'english', label: 'English' },
                { value: 'hindi', label: 'Hindi' },
                { value: 'spanish', label: 'Spanish' },
                { value: 'french', label: 'French' },
                { value: 'german', label: 'German' },
                { value: 'japanese', label: 'Japanese' },
                { value: 'korean', label: 'Korean' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CoursesList;