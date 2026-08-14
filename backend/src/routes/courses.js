const { Router } = require('express');
const CourseController = require('../controllers/courseController');
const { authenticate } = require('../middleware/auth');

const router = Router();

/**
 * @swagger
 * /api/courses:
 *   post:
 *     summary: Create a new course
 *     tags: [Courses]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CourseCreateRequest' }
 *     responses:
 *       201:
 *         description: Course created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { course: { $ref: '#/components/schemas/Course' } }
 *   get:
 *     summary: List courses
 *     tags: [Courses]
 *     parameters:
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *       - name: status
 *         in: query
 *         schema: { type: string }
 *       - name: category
 *         in: query
 *         schema: { type: string }
 *       - name: search
 *         in: query
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated list of courses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 courses: { type: array, items: { $ref: '#/components/schemas/Course' } }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.post('/', authenticate, CourseController.create);
router.get('/', authenticate, CourseController.list);

/**
 * @swagger
 * /api/courses/{id}:
 *   get:
 *     summary: Get a single course
 *     tags: [Courses]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200:
 *         description: The course
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { course: { $ref: '#/components/schemas/Course' } }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     summary: Update a course
 *     tags: [Courses]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CourseCreateRequest' }
 *     responses:
 *       200:
 *         description: Updated course
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { course: { $ref: '#/components/schemas/Course' } }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     summary: Delete a course
 *     tags: [Courses]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200: { description: Deleted }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', authenticate, CourseController.getById);
router.put('/:id', authenticate, CourseController.update);
router.delete('/:id', authenticate, CourseController.delete);

/**
 * @swagger
 * /api/courses/{id}/stop:
 *   post:
 *     summary: Stop every not-yet-finished lesson in this course
 *     tags: [Courses]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200: { description: All in-progress lessons stopped }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/stop', authenticate, CourseController.stop);

/**
 * @swagger
 * /api/courses/{id}/videos:
 *   get:
 *     summary: Get all videos (lessons) for a course
 *     tags: [Courses]
 *     parameters:
 *       - { $ref: '#/components/parameters/EntityId' }
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Paginated list of course videos
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 videos: { type: array, items: { $ref: '#/components/schemas/CourseVideo' } }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 *   post:
 *     summary: Create a video (lesson) in a course
 *     tags: [Courses]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CourseVideoCreateRequest' }
 *     responses:
 *       201:
 *         description: Video created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { video: { $ref: '#/components/schemas/CourseVideo' } }
 */
router.get('/:id/videos', authenticate, CourseController.listVideos);
router.post('/:id/videos', authenticate, CourseController.createVideo);

/**
 * @swagger
 * /api/courses/{id}/generate-curriculum:
 *   post:
 *     summary: Generate a full Udemy-style curriculum via the LLM for review
 *     description: Read-only - no CourseVideo records are created here. The frontend shows the returned lessons as an editable preview before the user approves creation.
 *     tags: [Courses]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, topic]
 *             properties:
 *               title: { type: string }
 *               topic: { type: string }
 *     responses:
 *       200:
 *         description: Generated lesson list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 lessons: { type: array, items: { $ref: '#/components/schemas/CurriculumLesson' } }
 *       400: { description: title and topic are required }
 */
router.post('/:id/generate-curriculum', authenticate, CourseController.generateCurriculum);

/**
 * @swagger
 * /api/courses/{id}/curriculum-history:
 *   get:
 *     summary: List previously generated curriculum structures for a course
 *     description: Each call to generate-curriculum is saved as its own CourseCurriculum record, so past generations remain available here even after the draft/videos have moved on.
 *     tags: [Courses]
 *     parameters:
 *       - { $ref: '#/components/parameters/EntityId' }
 *       - $ref: '#/components/parameters/PageParam'
 *       - $ref: '#/components/parameters/LimitParam'
 *     responses:
 *       200:
 *         description: Paginated list of saved curriculum structures
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 curricula: { type: array, items: { type: object } }
 *                 pagination: { $ref: '#/components/schemas/Pagination' }
 */
router.get('/:id/curriculum-history', authenticate, CourseController.listCurriculumHistory);

/**
 * @swagger
 * /api/courses/{id}/curriculum-videos:
 *   post:
 *     summary: Create one CourseVideo per lesson from an approved curriculum
 *     description: Takes the (possibly user-edited) lesson list returned by generate-curriculum and creates real CourseVideo records.
 *     tags: [Courses]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CurriculumVideosCreateRequest' }
 *     responses:
 *       201:
 *         description: Videos created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 videos: { type: array, items: { $ref: '#/components/schemas/CourseVideo' } }
 */
router.post('/:id/curriculum-videos', authenticate, CourseController.createCurriculumVideos);

/**
 * @swagger
 * /api/courses/{id}/curriculum-draft:
 *   put:
 *     summary: Autosave the in-progress curriculum generation draft
 *     description: Saves form values + generated lessons so the frontend can restore it after navigating away and back.
 *     tags: [Courses]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200:
 *         description: Draft saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties: { curriculumDraft: { type: object } }
 *   delete:
 *     summary: Clear the curriculum draft
 *     description: Called once its lessons have been created into real CourseVideo records.
 *     tags: [Courses]
 *     parameters: [{ $ref: '#/components/parameters/EntityId' }]
 *     responses:
 *       200: { description: Draft cleared }
 */
router.put('/:id/curriculum-draft', authenticate, CourseController.saveCurriculumDraft);
router.delete('/:id/curriculum-draft', authenticate, CourseController.clearCurriculumDraft);

module.exports = router;
