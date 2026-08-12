const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');
const config = require('./index');
const {
  VIDEO_TYPES,
  RESOLUTIONS,
  LANGUAGES,
  JOB_STATUS,
  COURSE_STATUS,
  VIDEO_STATUS,
  STAGE_STATUS,
  CATEGORIES,
  DIFFICULTIES,
  STANDALONE_VIDEO_DURATIONS,
} = require('../constants');

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'Vireon AI API',
    version: '1.0.0',
    description:
      'API for the Vireon AI video generation platform: standalone/short-form video jobs, ' +
      'Udemy-style course generation, TTS voices, analytics and live logs. ' +
      'This is a single-user, localhost/LAN-oriented service - there is no authentication.',
  },
  servers: [
    { url: `http://localhost:${config.port}`, description: 'Local server' },
  ],
  tags: [
    { name: 'Videos', description: 'Standalone video job pipeline (script -> audio -> render)' },
    { name: 'Scenes', description: 'Per-scene editing for a video job' },
    { name: 'Courses', description: 'Udemy-style course management and curriculum generation' },
    { name: 'Course Videos', description: 'Individual lesson videos within a course' },
    { name: 'Voices', description: 'TTS voice catalog and favorites' },
    { name: 'Analytics', description: 'Dashboard/overview statistics' },
    { name: 'Logs', description: 'Live server log stream (recent buffer)' },
  ],
  components: {
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
      ValidationError: {
        type: 'object',
        properties: {
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
      },
      VideoJob: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: 'job-A1B2C3D4' },
          topic: { type: 'string' },
          type: { type: 'string', enum: VIDEO_TYPES },
          language: { type: 'string', enum: LANGUAGES },
          duration: { type: 'number', example: 5 },
          voice: { type: 'string', example: 'female-1' },
          hostVoice: { type: 'string' },
          guestVoice: { type: 'string' },
          hostName: { type: 'string' },
          guestName: { type: 'string' },
          resolution: { type: 'string', enum: RESOLUTIONS },
          aspectRatio: { type: 'string', example: '16:9' },
          fastGeneration: { type: 'boolean' },
          status: { type: 'string', enum: Object.values(JOB_STATUS) },
          progress: { type: 'number', example: 20 },
          currentStep: { type: 'string' },
          script: { $ref: '#/components/schemas/Script' },
          error: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      VideoJobCreateRequest: {
        type: 'object',
        required: ['topic', 'type'],
        properties: {
          topic: { type: 'string', minLength: 3, maxLength: 500 },
          type: { type: 'string', enum: VIDEO_TYPES },
          language: { type: 'string', enum: LANGUAGES, default: 'english' },
          duration: {
            type: 'number',
            default: 5,
            description: `One of ${STANDALONE_VIDEO_DURATIONS.join(', ')} (or 1/2/3 for youtube_shorts)`,
          },
          voice: { type: 'string', default: 'female-1', description: 'Ignored for podcast type (use hostVoice/guestVoice)' },
          hostVoice: { type: 'string', description: 'Required when type is podcast' },
          guestVoice: { type: 'string', description: 'Required when type is podcast' },
          hostName: { type: 'string' },
          guestName: { type: 'string' },
          resolution: { type: 'string', enum: RESOLUTIONS, default: '1920x1080' },
          fastGeneration: { type: 'boolean', default: true },
        },
      },
      VideoJobUpdateRequest: {
        type: 'object',
        description: 'All fields optional; at least one must be provided. `type` is not editable.',
        properties: {
          topic: { type: 'string', minLength: 3, maxLength: 500 },
          language: { type: 'string', enum: LANGUAGES },
          duration: { type: 'number' },
          voice: { type: 'string' },
          hostVoice: { type: 'string' },
          guestVoice: { type: 'string' },
          hostName: { type: 'string' },
          guestName: { type: 'string' },
          resolution: { type: 'string', enum: RESOLUTIONS },
        },
      },
      JobActionResponse: {
        type: 'object',
        properties: {
          jobId: { type: 'string' },
          status: { type: 'string', enum: Object.values(JOB_STATUS) },
          progress: { type: 'number' },
        },
      },
      Scene: {
        type: 'object',
        properties: {
          sceneNumber: { type: 'number' },
          templateId: { type: 'string' },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          speaker: { type: 'string' },
          audio: {
            type: 'object',
            properties: { text: { type: 'string' } },
          },
          elements: { type: 'object', description: 'Template-specific element shape' },
        },
      },
      Script: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          thumbnailPrompt: { type: 'string' },
          scenes: { type: 'array', items: { $ref: '#/components/schemas/Scene' } },
        },
      },
      ActivityLog: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          videoId: { type: 'string' },
          message: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Course: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          difficulty: { type: 'string', enum: DIFFICULTIES },
          language: { type: 'string', enum: LANGUAGES },
          thumbnail: { type: 'string' },
          status: { type: 'string', enum: Object.values(COURSE_STATUS) },
          videoCount: { type: 'number' },
          completedVideoCount: { type: 'number' },
          curriculumDraft: { type: 'object', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CourseCreateRequest: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', maxLength: 200 },
          description: { type: 'string', maxLength: 2000 },
          category: { type: 'string', enum: CATEGORIES },
          difficulty: { type: 'string', enum: DIFFICULTIES },
          language: { type: 'string', enum: LANGUAGES },
          thumbnail: { type: 'string' },
        },
      },
      CourseVideo: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          courseId: { type: 'string' },
          title: { type: 'string' },
          topic: { type: 'string' },
          order: { type: 'number' },
          duration: { type: 'number' },
          voice: { type: 'string' },
          style: { type: 'string' },
          additionalInstructions: { type: 'string' },
          status: { type: 'string', enum: Object.values(VIDEO_STATUS) },
          scriptStatus: { type: 'string', enum: Object.values(STAGE_STATUS) },
          audioStatus: { type: 'string', enum: Object.values(STAGE_STATUS) },
          videoStatus: { type: 'string', enum: Object.values(STAGE_STATUS) },
          script: { $ref: '#/components/schemas/Script' },
          approved: { type: 'boolean' },
          audioUrl: { type: 'string' },
          audioDuration: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CourseVideoCreateRequest: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', maxLength: 200 },
          topic: { type: 'string', maxLength: 1000 },
          order: { type: 'number' },
          duration: { type: 'number' },
          voice: { type: 'string' },
          style: { type: 'string' },
          additionalInstructions: { type: 'string', maxLength: 1000 },
        },
      },
      CurriculumLesson: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          topic: { type: 'string' },
        },
      },
      CurriculumVideosCreateRequest: {
        type: 'object',
        required: ['lessons'],
        properties: {
          lessons: { type: 'array', items: { $ref: '#/components/schemas/CurriculumLesson' } },
          voice: { type: 'string' },
          style: { type: 'string' },
          duration: { type: 'number' },
          additionalInstructions: { type: 'string' },
        },
      },
      BulkVideoIdsRequest: {
        type: 'object',
        required: ['videoIds'],
        properties: {
          videoIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
        },
      },
      BulkGenerateRequest: {
        type: 'object',
        required: ['videoIds', 'action'],
        properties: {
          videoIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
          action: {
            type: 'string',
            enum: ['generate-script', 'generate-audio', 'render', 'generate-full'],
          },
        },
      },
      Voice: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          file: { type: 'string' },
          previewUrl: { type: 'string' },
          isFavorite: { type: 'boolean' },
        },
      },
      VoiceListResponse: {
        type: 'object',
        properties: {
          custom: { type: 'array', items: { $ref: '#/components/schemas/Voice' } },
          clone: { type: 'array', items: { $ref: '#/components/schemas/Voice' } },
        },
      },
      Pagination: {
        type: 'object',
        properties: {
          page: { type: 'number' },
          limit: { type: 'number' },
          total: { type: 'number' },
          pages: { type: 'number' },
        },
      },
    },
    parameters: {
      VideoJobId: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Video job id (format job-XXXXXXXX)',
        schema: { type: 'string', example: 'job-A1B2C3D4' },
      },
      EntityId: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Entity id (course, course-video, ...)',
        schema: { type: 'string' },
      },
      SceneNumber: {
        name: 'sceneNumber',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
      },
      PageParam: {
        name: 'page',
        in: 'query',
        schema: { type: 'integer', default: 1 },
      },
      LimitParam: {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', default: 20 },
      },
    },
    responses: {
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
      BadRequest: {
        description: 'Validation error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } },
      },
    },
  },
};

// swagger-jsdoc's glob matching needs forward slashes even on Windows -
// path.resolve()/path.join() produce backslashes there, which silently
// match nothing and leave `paths` empty.
const options = {
  definition,
  apis: [path.resolve(__dirname, '../routes/*.js').replace(/\\/g, '/')],
};

module.exports = swaggerJsdoc(options);
