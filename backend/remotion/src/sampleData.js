/**
 * Sample scene data for previewing templates in Remotion Studio.
 * One sample per template - every template variant sharing a sceneType
 * (see SceneTypeCategories in templates/TemplateCategories.js) reads the
 * exact same `elements` shape, they just render it differently.
 */

export const sampleScenes = {
  '001-title': {
    templateId: '001-title',
    elements: {
      title: 'Educational Card',
      subtitle: 'A preview of the title template in action.',
      backgroundColor: '#1a1a2e',
      image: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=800&h=600&fit=crop',
    },
    duration: 8,
  },
  '002-title': {
    templateId: '002-title',
    elements: {
      title: 'Into the Unknown',
      subtitle: 'A preview of the parallax hero title template in action.',
      backgroundColor: '#1a1a2e',
      image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&h=1080&fit=crop',
    },
    duration: 8,
  },
  '003-title': {
    templateId: '003-title',
    elements: {
      title: 'Simplicity',
      subtitle: 'A preview of the modern minimal title template in action.',
      backgroundColor: '#0d1117',
    },
    duration: 8,
  },
  '001-content': {
    templateId: '001-content',
    elements: {
      title: 'Key Takeaways',
      items: [
        { heading: 'Focus:', text: 'Ship the smallest version that proves the idea.' },
        { heading: 'Iterate:', text: 'Real usage beats speculation every time.' },
        { heading: 'Measure:', text: 'Track outcomes, not just activity.' },
      ],
      backgroundColor: '#1a1a2e',
      caption: 'These three principles guide every decision we make.',
    },
    duration: 8,
  },
  '002-content': {
    templateId: '002-content',
    elements: {
      title: 'Why It Works',
      items: [
        { heading: 'Fast', text: 'Ships in days, not quarters.' },
        { heading: 'Simple', text: 'No config, no boilerplate.' },
        { heading: 'Scalable', text: 'Grows with your team.' },
        { heading: 'Reliable', text: 'Tested in production daily.' },
      ],
      backgroundColor: '#1a1a2e',
      caption: 'A preview of the content grid template in action.',
    },
    duration: 8,
  },
  '003-content': {
    templateId: '003-content',
    elements: {
      title: 'How It Works',
      items: [
        { heading: 'Plan', text: 'Sketch the smallest version that proves the idea.' },
        { heading: 'Build', text: 'Ship it behind a flag within days.' },
        { heading: 'Learn', text: 'Watch real usage, not assumptions.' },
      ],
      backgroundColor: '#1a1a2e',
      caption: 'A preview of the content timeline template in action.',
    },
    duration: 8,
  },
  '004-content': {
    templateId: '004-content',
    elements: {
      title: 'Launch Checklist',
      items: [
        { heading: 'Design:', text: 'Finalize the visual system and tokens.' },
        { heading: 'Build:', text: 'Ship the core flow behind a flag.' },
        { heading: 'Test:', text: 'Run through every edge case twice.' },
      ],
      backgroundColor: '#1a1a2e',
      caption: 'A preview of the content checklist template in action.',
    },
    duration: 8,
  },
  '005-content': {
    templateId: '005-content',
    elements: {
      title: 'Everything Included',
      items: [
        { heading: 'Analytics', text: 'Real-time dashboards for every metric.' },
        { heading: 'Automation', text: 'Workflows that run themselves.' },
        { heading: 'Security', text: 'Enterprise-grade access controls.' },
        { heading: 'Support', text: '24/7 help from a real human.' },
      ],
      backgroundColor: '#1a1a2e',
      caption: 'A preview of the content two-column template in action.',
    },
    duration: 8,
  },
  '001-contentwithimage': {
    templateId: '001-contentwithimage',
    elements: {
      title: 'Story Image Text',
      subtitle: 'A preview of the content + image template in action.',
      backgroundColor: '#1a1a2e',
      body: 'A journey through innovation and discovery.',
      image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop',
      badge: 'Story',
    },
    duration: 8,
  },
  '002-contentwithimage': {
    templateId: '002-contentwithimage',
    elements: {
      title: 'Field Notes',
      subtitle: 'A preview of the image card content + image template in action.',
      backgroundColor: '#16213e',
      body: 'Every great product starts with a single small observation.',
      image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&h=600&fit=crop',
      badge: 'Chapter 1',
    },
    duration: 8,
  },
  '001-image': {
    templateId: '001-image',
    elements: {
      image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
      caption: 'The Milky Way stretches across the night sky.',
      label: 'Featured',
    },
    duration: 8,
  },
  '002-image': {
    templateId: '002-image',
    elements: {
      image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&h=1080&fit=crop',
      caption: 'A single moment, framed forever.',
      label: 'Cinematic',
    },
    duration: 8,
  },
  '003-image': {
    templateId: '003-image',
    elements: {
      image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
      caption: 'Layers of light across the horizon.',
      label: 'Gallery',
    },
    duration: 8,
  },
  '001-podcast': {
    templateId: '001-podcast',
    elements: {
      title: 'Podcast',
      subtitle: 'A preview of the podcast template in action.',
      backgroundColor: '#1a0a2e',
      hostName: 'Alex Rivera',
      hostImage: '',
      caption: 'Welcome to another episode of Tech Talks!',
    },
    duration: 8,
  },
  '002-podcast': {
    templateId: '002-podcast',
    elements: {
      title: 'The Interview',
      subtitle: 'A preview of the interview podcast template in action.',
      backgroundColor: '#111827',
      hostName: 'Jamie Chen',
      hostImage: '',
      caption: 'Thanks for having me, excited to dig into this today!',
    },
    duration: 8,
  },
};
