/**
 * Sample scene data for previewing templates in Remotion Studio.
 * Only 3 templates are kept: title, content, content-with-image
 */

export const sampleScenes = {
  'template-001': {
    templateId: 'template-001',
    elements: {
      title: 'The Solar System',
      subtitle: 'A journey through our cosmic neighborhood - from the Sun to the distant Kuiper Belt.',
      image: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=800&h=600&fit=crop',
      backgroundColor: '#0a0a2e',
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

  'template-009': {
    templateId: 'template-009',
    elements: {
      title: 'Key Takeaways',
      items: [
        { text: 'AI is transforming every industry - from healthcare to finance', icon: '🌟' },
        { text: 'Data-driven decisions outperform gut feelings by 85%', icon: '✅' },
        { text: 'Automation reduces operational costs by up to 40%', icon: '💡' },
        { text: 'Customer experience is the new competitive battleground', icon: '📌' },
        { text: 'Sustainability drives innovation and brand loyalty', icon: '🔑' },
      ],
      backgroundColor: '#16213e',
    },
    duration: 10,
  },
};