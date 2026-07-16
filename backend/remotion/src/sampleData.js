/**
 * Sample scene data for previewing each template in Remotion Studio.
 * Each entry provides realistic mock data for the template's expected elements.
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

  'template-002': {
    templateId: 'template-002',
    elements: {
      question: 'What is the speed of light?',
      answer: '299,792,458 meters per second - roughly 300,000 km/s!',
      questionIcon: '\u2753',
      answerIcon: '\uD83D\uDCA1',
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
        { date: '1957', text: 'Sputnik 1 - First artificial satellite launched by USSR' },
        { date: '1961', text: 'Yuri Gagarin becomes the first human in space' },
        { date: '1969', text: 'Apollo 11 - First humans land on the Moon' },
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
        body: 'Diameter: 6,779 km\nGravity: 3.72 m/s\u00B2\nDay length: 24.6 hours',
        icon: '\uD83D\uDD34',
      },
      rightCard: {
        title: 'Earth',
        body: 'Diameter: 12,742 km\nGravity: 9.81 m/s\u00B2\nDay length: 24.0 hours',
        icon: '\uD83C\uDF0D',
      },
      backgroundColor: '#2d1b00',
    },
    duration: 8,
  },

  'template-006': {
    templateId: 'template-006',
    elements: {
      quote: 'The important thing is not to stop questioning. Curiosity has its own reason for existing.',
      author: 'Albert Einstein',
      authorTitle: 'Theoretical Physicist',
      authorImage: 'https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=120&h=120&fit=crop&crop=face',
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-007': {
    templateId: 'template-007',
    elements: {
      title: 'YouTube Channel Growth',
      stats: [
        { value: '2.4M', label: 'Subscribers', icon: '\uD83D\uDCFA' },
        { value: '89M', label: 'Total Views', icon: '\uD83D\uDC41' },
        { value: '12K', label: 'Videos', icon: '\uD83C\uDFAC' },
        { value: '4.8', label: 'Avg Rating', icon: '\u2B50' },
      ],
      backgroundColor: '#0f3460',
    },
    duration: 8,
  },

  'template-008': {
    templateId: 'template-008',
    elements: {
      title: 'Tech Stack',
      tags: [
        { text: 'React', icon: '\u269B' },
        { text: 'Node.js', icon: '\uD83D\uDFE2' },
        { text: 'TypeScript', icon: '\uD83D\uDCD8' },
        { text: 'Python', icon: '\uD83D\uDC0D' },
        { text: 'Docker', icon: '\uD83D\uDC33' },
        { text: 'GraphQL', icon: '\u25C7' },
        { text: 'AWS', icon: '\u2601' },
        { text: 'MongoDB', icon: '\uD83C\uDF43' },
      ],
      backgroundColor: '#1a1a3e',
    },
    duration: 8,
  },

  'template-009': {
    templateId: 'template-009',
    elements: {
      title: 'Key Takeaways',
      items: [
        { text: 'AI is transforming every industry - from healthcare to finance', icon: '\uD83C\uDF1F' },
        { text: 'Data-driven decisions outperform gut feelings by 85%', icon: '\u2705' },
        { text: 'Automation reduces operational costs by up to 40%', icon: '\uD83D\uDCA1' },
        { text: 'Customer experience is the new competitive battleground', icon: '\uD83D\uDCCC' },
        { text: 'Sustainability drives innovation and brand loyalty', icon: '\uD83D\uDD11' },
      ],
      backgroundColor: '#16213e',
    },
    duration: 10,
  },

  'template-010': {
    templateId: 'template-010',
    elements: {
      title: 'Digital Transformation',
      subtitle: 'Empowering businesses with cutting-edge technology solutions',
      stats: [
        { value: '500+', label: 'Clients' },
        { value: '99.9%', label: 'Uptime' },
        { value: '24/7', label: 'Support' },
      ],
      backgroundColor: '#0a0a2e',
    },
    duration: 8,
  },

  'template-011': {
    templateId: 'template-011',
    elements: {
      title: 'Our Team',
      members: [
        {
          name: 'Sarah Chen',
          role: 'CEO & Founder',
          bio: 'Visionary leader with 15+ years in tech',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
        },
        {
          name: 'Marcus Johnson',
          role: 'CTO',
          bio: 'Full-stack architect and AI enthusiast',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face',
        },
        {
          name: 'Elena Rodriguez',
          role: 'Design Lead',
          bio: 'Creating beautiful, intuitive experiences',
          avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face',
        },
      ],
      backgroundColor: '#1a1a2e',
    },
    duration: 8,
  },

  'template-012': {
    templateId: 'template-012',
    elements: {
      title: 'Product Launch',
      message: 'Something amazing is coming...',
      timeBlocks: [
        { value: '14', label: 'Days' },
        { value: '08', label: 'Hours' },
        { value: '42', label: 'Minutes' },
        { value: '15', label: 'Seconds' },
      ],
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-013': {
    templateId: 'template-013',
    elements: {
      title: 'How It Works',
      emoji: '\uD83D\uDE80',
      steps: [
        { title: 'Sign Up', description: 'Create your account in under 2 minutes' },
        { title: 'Configure', description: 'Set your preferences and connect your tools' },
        { title: 'Launch', description: 'Deploy with one click and monitor results' },
        { title: 'Scale', description: 'Grow organically with automated optimization' },
      ],
      backgroundColor: '#1e293b',
    },
    duration: 10,
  },

  'template-014': {
    templateId: 'template-014',
    elements: {
      title: 'Performance Metrics',
      bars: [
        { label: 'Speed', value: '92', icon: '\u26A1' },
        { label: 'Reliability', value: '88', icon: '\uD83D\uDD12' },
        { label: 'UX Score', value: '95', icon: '\uD83C\uDFA8' },
        { label: 'SEO', value: '78', icon: '\uD83D\uDD0D' },
        { label: 'Mobile', value: '85', icon: '\uD83D\uDCF1' },
      ],
      backgroundColor: '#16213e',
    },
    duration: 8,
  },

  'template-015': {
    templateId: 'template-015',
    elements: {
      title: 'Core Features',
      features: [
        { icon: '\uD83D\uDE80', title: 'Fast Performance', description: 'Lightning-fast load times' },
        { icon: '\uD83D\uDD12', title: 'Secure', description: 'Enterprise-grade security' },
        { icon: '\uD83D\uDCCA', title: 'Analytics', description: 'Real-time data insights' },
        { icon: '\u2601', title: 'Cloud Sync', description: 'Access from anywhere' },
        { icon: '\uD83C\uDFA8', title: 'Customizable', description: 'Tailor to your brand' },
        { icon: '\uD83D\uDCAC', title: '24/7 Support', description: 'We are here to help' },
      ],
      backgroundColor: '#0f3460',
    },
    duration: 8,
  },

  'template-016': {
    templateId: 'template-016',
    elements: {
      images: [
        { url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=600&h=400&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=600&h=400&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=600&h=400&fit=crop' },
        { url: 'https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=600&h=400&fit=crop' },
      ],
      caption: "Nature's beauty captured in four seasons",
      subtitle: 'A visual journey through landscapes',
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-017': {
    templateId: 'template-017',
    elements: {
      title: 'The Journey Begins',
      body: 'Every great adventure starts with a single step. Our story begins in the heart of the mountains, where the air is crisp and the horizon stretches endlessly.',
      image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&h=600&fit=crop',
      badge: 'Chapter 1',
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-018': {
    templateId: 'template-018',
    elements: {
      images: [
        { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop', height: '240px' },
        { url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400&h=500&fit=crop', height: '340px' },
        { url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=350&fit=crop', height: '280px' },
        { url: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=400&h=450&fit=crop', height: '300px' },
        { url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400&h=300&fit=crop', height: '220px' },
        { url: 'https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=400&h=400&fit=crop', height: '260px' },
      ],
      caption: 'A world of wonder',
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-019': {
    templateId: 'template-019',
    elements: {
      title: 'Discover the Unknown',
      subtitle: 'Explore breathtaking landscapes and uncover hidden stories waiting to be told.',
      image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
      cta: 'Start Exploring',
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-020': {
    templateId: 'template-020',
    elements: {
      title: 'Summit at Sunrise',
      body: 'The first light of dawn breaks over the mountain peaks, painting the sky in shades of gold and crimson.',
      image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&h=400&fit=crop',
      label: 'Travel Story',
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-021': {
    templateId: 'template-021',
    elements: {
      title: 'Under the Stars',
      body: 'A night spent under the canopy of stars, where the universe reveals its infinite beauty and ancient secrets.',
      image: 'https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=1920&h=1080&fit=crop',
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-022': {
    templateId: 'template-022',
    elements: {
      title: 'Memories in Print',
      photos: [
        { url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=400&h=300&fit=crop', caption: 'Mountain trails' },
        { url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=300&fit=crop', caption: 'Forest whispers' },
      ],
      backgroundColor: '#1a1a3e',
    },
    duration: 8,
  },

  'template-023': {
    templateId: 'template-023',
    elements: {
      title: 'Travel Stories',
      cards: [
        { image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400&h=200&fit=crop', title: 'Mountain Escape', description: 'Find peace among the peaks' },
        { image: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&h=200&fit=crop', title: 'Forest Adventure', description: 'Explore ancient woodlands' },
        { image: 'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=400&h=200&fit=crop', title: 'Coastal Journey', description: 'Where land meets sea' },
      ],
      backgroundColor: '#1e293b',
    },
    duration: 8,
  },

  'template-024': {
    templateId: 'template-024',
    elements: {
      title: 'Above & Below',
      label: 'Dual Perspective',
      topImage: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=400&fit=crop',
      bottomImage: 'https://images.unsplash.com/photo-1505144808419-1957a94ca61e?w=800&h=400&fit=crop',
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-025': {
    templateId: 'template-025',
    elements: {
      title: 'The Hidden Valley',
      body: 'Deep within the mountains lies a valley untouched by time, where nature reigns supreme.',
      image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1920&h=1080&fit=crop',
      tag: 'New Discovery',
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },
};
