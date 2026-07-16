/**
 * Sample scene data for previewing each template in Remotion Studio.
 * Each entry provides realistic mock data for the template's expected elements.
 */

export const sampleScenes = {
  'template-001': {
    templateId: 'template-001',
    elements: {
      title: 'The Solar System',
      subtitle: 'A journey through our cosmic neighborhood — from the Sun to the distant Kuiper Belt.',
      image: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=800&h=600&fit=crop',
      backgroundColor: '#0a0a2e',
    },
    duration: 8,
  },

  'template-002': {
    templateId: 'template-002',
    elements: {
      question: 'What is the speed of light?',
      answer: '299,792,458 meters per second — roughly 300,000 km/s!',
      questionIcon: '🤔',
      answerIcon: '💡',
      backgroundColor: '#1a1a3e',
    },
    duration: 8,
  },

  'template-003': {
    templateId: 'template-003',
    elements: {
      image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
      caption: 'The Milky Way stretches across the night sky, a reminder of the vast universe we inhabit.',
      label: 'Featured',
      backgroundColor: '#0f0f23',
    },
    duration: 8,
  },

  'template-004': {
    templateId: 'template-004',
    elements: {
      title: 'Key Events in Space Exploration',
      items: [
        { date: '1957', text: 'Sputnik 1 — First artificial satellite launched by USSR' },
        { date: '1961', text: 'Yuri Gagarin becomes the first human in space' },
        { date: '1969', text: 'Apollo 11 — First humans land on the Moon' },
        { date: '1998', text: 'Construction begins on the International Space Station' },
      ],
      backgroundColor: '#1e293b',
    },
    duration: 12,
  },

  'template-005': {
    templateId: 'template-005',
    elements: {
      header: 'Mars vs Earth',
      leftCard: {
        title: 'Mars',
        body: 'Diameter: 6,779 km\nGravity: 3.72 m/s²\nDay length: 24.6 hours',
        icon: '🔴',
      },
      rightCard: {
        title: 'Earth',
        body: 'Diameter: 12,742 km\nGravity: 9.81 m/s²\nDay length: 24.0 hours',
        icon: '🌍',
      },
      backgroundColor: '#2d1b00',
    },
    duration: 8,
  },
};
