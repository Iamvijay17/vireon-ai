/**
 * Sample scene data for previewing templates in Remotion Studio.
 * One sample per template - there are exactly 5.
 */

export const sampleScenes = {
  title: {
    templateId: 'title',
    elements: {
      title: 'Educational Card',
      subtitle: 'A preview of the title template in action.',
      backgroundColor: '#1a1a2e',
      image: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=800&h=600&fit=crop',
    },
    duration: 8,
  },
  content: {
    templateId: 'content',
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
  contentwithimage: {
    templateId: 'contentwithimage',
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
  image: {
    templateId: 'image',
    elements: {
      image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
      caption: 'The Milky Way stretches across the night sky.',
      label: 'Featured',
    },
    duration: 8,
  },
  podcast: {
    templateId: 'podcast',
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
};
