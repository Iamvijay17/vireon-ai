/**
 * Sample scenes for previewing the Generative Scene Engine in Remotion
 * Studio (see Root.jsx) - covers the content shapes called out in the
 * generative-engine plan's verification section: short title, long
 * paragraph, a 6-item list, and list+image.
 */
export const sampleGenerativeScenes = {
  'gen-short-title': {
    sceneId: 'gen-short-title',
    templateId: 'generative',
    elements: { title: 'The Future of Work' },
  },
  'gen-long-paragraph': {
    sceneId: 'gen-long-paragraph',
    templateId: 'generative',
    elements: {
      title: 'Why It Matters',
      items: [
        { text: 'Remote-first teams now ship faster than co-located ones did five years ago, because async communication forces every decision to be written down instead of living in a hallway conversation nobody else can reference.' },
        { text: 'That written record becomes a searchable institutional memory, which compounds over time into an advantage that is very hard for a fully in-office competitor to replicate quickly.' },
      ],
    },
  },
  'gen-six-item-list': {
    sceneId: 'gen-six-item-list',
    templateId: 'generative',
    elements: {
      title: 'Six Things To Check',
      items: [
        { heading: '01', text: 'Ship weekly' },
        { heading: '02', text: 'Talk to users' },
        { heading: '03', text: 'Measure churn' },
        { heading: '04', text: 'Cut scope' },
        { heading: '05', text: 'Automate tests' },
        { heading: '06', text: 'Review metrics' },
      ],
    },
  },
  'gen-list-with-image': {
    sceneId: 'gen-list-with-image',
    templateId: 'generative',
    elements: {
      title: 'Field Notes',
      body: 'A short dispatch from the field, paired with a photo that sets the scene before the narration continues.',
      image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1200&h=1600&fit=crop',
    },
  },
  'gen-image-headline': {
    sceneId: 'gen-image-headline',
    templateId: 'generative',
    sceneType: 'image',
    elements: {
      image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&h=1080&fit=crop',
      caption: 'Into the Unknown',
      label: 'Featured',
    },
  },
  'gen-podcast-episode': {
    sceneId: 'gen-podcast-episode',
    templateId: 'generative',
    sceneType: 'podcast',
    elements: {
      title: 'The Long Game',
      subtitle: 'Episode 42: Building things that last',
      hostName: 'Jordan Lee',
      hostImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=800&fit=crop',
      caption: 'Welcome back to the show, today we are talking about patience.',
    },
  },
  'gen-podcast-episode-2': {
    sceneId: 'gen-podcast-episode-2',
    templateId: 'generative',
    sceneType: 'podcast',
    elements: {
      title: 'Deep Focus',
      subtitle: 'Episode 7: The case for slow mornings',
      hostName: 'Amara Chen',
      hostImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&h=800&fit=crop',
      caption: 'Today we are unpacking why a slow start actually speeds everything else up.',
    },
  },
  'gen-four-item-medium': {
    sceneId: 'gen-four-item-medium',
    templateId: 'generative',
    elements: {
      title: 'Core Principles',
      items: [
        { heading: 'Clarity', text: 'Say the simplest true thing.' },
        { heading: 'Speed', text: 'Ship small changes often.' },
        { heading: 'Trust', text: 'Default to transparency.' },
        { heading: 'Focus', text: 'Do fewer things, better.' },
      ],
    },
  },
};
