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

  'template-026': {
    templateId: 'template-026',
    elements: {
      term: 'AI',
      title: 'Artificial Intelligence',
      definition: 'The simulation of human intelligence in machines that are programmed to think, learn, and problem-solve like humans.',
      example: 'ChatGPT, Midjourney, and self-driving cars are all examples of AI in action today.',
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-027': {
    templateId: 'template-027',
    elements: {
      title: 'Why Choose Us',
      points: [
        { text: 'Proven track record with 500+ successful projects delivered', icon: '\u2713' },
        { text: '24/7 dedicated support team available worldwide', icon: '\u2713' },
        { text: 'Enterprise-grade security with end-to-end encryption', icon: '\u2713' },
        { text: 'Scalable solutions that grow with your business', icon: '\u2713' },
        { text: '99.9% uptime guaranteed with SLA backing', icon: '\u2713' },
      ],
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-028': {
    templateId: 'template-028',
    elements: {
      title: 'Plan Comparison',
      subtitle: 'Find the perfect plan for your needs',
      headers: ['Feature', 'Starter', 'Pro', 'Enterprise'],
      rows: [
        { cells: ['Users', 'Up to 5', 'Up to 50', 'Unlimited'] },
        { cells: ['Storage', '10 GB', '100 GB', '1 TB'] },
        { cells: ['Support', 'Email', 'Priority', '24/7 Dedicated'] },
        { cells: ['Analytics', 'Basic', 'Advanced', 'Custom'] },
        { cells: ['API Access', 'No', 'Yes', 'Yes + SDK'] },
      ],
      note: 'All plans include a 14-day free trial. No credit card required.',
      backgroundColor: '#0f172a',
    },
    duration: 10,
  },

  'template-029': {
    templateId: 'template-029',
    elements: {
      title: 'Did You Know?',
      subtitle: 'Fascinating facts that will surprise you',
      facts: [
        { icon: 'brain', title: 'Brain Power', description: 'The human brain processes 70,000 thoughts per day on average.' },
        { icon: 'globe', title: 'Internet Reach', description: 'Over 5.4 billion people use the internet worldwide as of 2024.' },
        { icon: 'cloud', title: 'Cloud Storage', description: 'Over 60% of corporate data is stored in the cloud today.' },
        { icon: 'mobile', title: 'Mobile First', description: 'Mobile devices account for 59% of global web traffic.' },
      ],
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-030': {
    templateId: 'template-030',
    elements: {
      badge: 'Featured Report',
      title: 'State of Digital Transformation 2024',
      body: 'Organizations that embrace digital transformation see 45% higher revenue growth and 3x better customer satisfaction scores.',
      stats: [
        { value: '78%', label: 'Adoption Rate' },
        { value: '3.2x', label: 'ROI Increase' },
        { value: '92%', label: 'Satisfaction' },
      ],
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-031': {
    templateId: 'template-031',
    elements: {
      title: 'Expert Insight',
      meta: 'From our research team',
      quote: 'The most successful companies are not just adopting technology - they are reimagining their entire business model around digital capabilities.',
      author: 'Dr. Sarah Mitchell',
      source: 'Digital Transformation Report 2024',
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-032': {
    templateId: 'template-032',
    elements: {
      title: 'Getting Started Guide',
      subtitle: 'Follow these simple steps to begin',
      steps: [
        { num: 1, title: 'Create Account', description: 'Sign up in under 2 minutes with your email' },
        { num: 2, title: 'Set Up Profile', description: 'Configure your preferences and team settings' },
        { num: 3, title: 'Connect Tools', description: 'Integrate with your existing workflow tools' },
        { num: 4, title: 'Launch & Monitor', description: 'Go live and track performance in real-time' },
      ],
      backgroundColor: '#0f172a',
    },
    duration: 10,
  },

  'template-033': {
    templateId: 'template-033',
    elements: {
      title: 'Key Benefits',
      subtitle: 'Why industry leaders choose our platform',
      items: [
        { icon: 'zap', title: 'Lightning Fast', description: '10x faster processing than competitors' },
        { icon: 'lock', title: 'Bank-Grade Security', description: 'SOC 2 Type II certified encryption' },
        { icon: 'tool', title: 'Easy Integration', description: 'Connect with 200+ tools in minutes' },
        { icon: 'chart', title: 'Real-Time Analytics', description: 'Live dashboards with actionable insights' },
      ],
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-034': {
    templateId: 'template-034',
    elements: {
      title: 'Learning Paths',
      items: [
        { level: 'Beginner', title: 'Fundamentals', description: 'Core concepts and basic skills', tags: ['Basics', 'Theory', 'Practice'] },
        { level: 'Intermediate', title: 'Advanced Topics', description: 'Deep dive into complex subjects', tags: ['Workshops', 'Projects', 'Mentorship'] },
        { level: 'Expert', title: 'Master Class', description: 'Cutting-edge techniques and research', tags: ['Research', 'Innovation', 'Leadership'] },
      ],
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-035': {
    templateId: 'template-035',
    elements: {
      title: 'Technology Stack',
      subtitle: 'Built with modern, reliable technologies',
      items: [
        { text: 'React & Next.js', icon: 'atom' },
        { text: 'Node.js & Python', icon: 'node' },
        { text: 'TypeScript', icon: 'ts' },
        { text: 'PostgreSQL', icon: 'db' },
        { text: 'Docker & K8s', icon: 'docker' },
        { text: 'GraphQL', icon: 'gql' },
        { text: 'AWS Cloud', icon: 'cloud' },
        { text: 'Redis Cache', icon: 'bolt' },
      ],
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-036': {
    templateId: 'template-036',
    elements: {
      label: 'Case Study',
      title: 'How Acme Corp Scaled 10x',
      body: 'By leveraging our platform, Acme Corp automated their workflow, reduced costs by 40%, and scaled their operations from 50 to 500 employees in just 6 months.',
      image: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800&h=600&fit=crop',
      stat: '40% cost reduction | 10x growth | 99.9% uptime',
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-037': {
    templateId: 'template-037',
    elements: {
      title: 'Company Milestones',
      sub: 'Our journey from startup to industry leader',
      items: [
        { year: '2019', title: 'Founded', description: 'Started with a team of 3 in a small garage' },
        { year: '2020', title: 'First 100 Customers', description: 'Reached product-market fit and began scaling' },
        { year: '2021', title: 'Series A Funding', description: 'Raised $10M to accelerate growth' },
        { year: '2022', title: 'Global Expansion', description: 'Opened offices in 12 countries worldwide' },
        { year: '2023', title: '1M Users', description: 'Crossed the million user milestone' },
      ],
      backgroundColor: '#0f172a',
    },
    duration: 10,
  },

  'template-038': {
    templateId: 'template-038',
    elements: {
      title: 'Core Metrics',
      items: [
        { icon: 'rocket', title: 'Performance', description: '99.9% uptime SLA' },
        { icon: 'lock', title: 'Security', description: 'SOC 2 Type II certified' },
        { icon: 'chart', title: 'Analytics', description: 'Real-time dashboards' },
        { icon: 'globe', title: 'Global Reach', description: '12 data centers' },
        { icon: 'team', title: 'Team', description: '200+ experts' },
        { icon: 'award', title: 'Awards', description: '15 industry awards' },
      ],
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-039': {
    templateId: 'template-039',
    elements: {
      name: 'Alexandra Chen',
      role: 'CEO & Co-Founder',
      bio: 'A visionary leader with 20+ years of experience in technology and innovation. Passionate about building products that make a difference.',
      image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop&crop=face',
      stats: [
        { value: '20+', label: 'Years Exp' },
        { value: '500+', label: 'Projects' },
        { value: '50+', label: 'Awards' },
      ],
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-040': {
    templateId: 'template-040',
    elements: {
      title: 'Skills & Expertise',
      subtitle: 'Technologies we work with daily',
      items: [
        { text: 'React', icon: 'atom' },
        { text: 'Python', icon: 'python' },
        { text: 'AWS', icon: 'cloud' },
        { text: 'Docker', icon: 'docker' },
        { text: 'GraphQL', icon: 'gql' },
        { text: 'TypeScript', icon: 'ts' },
        { text: 'Node.js', icon: 'node' },
        { text: 'PostgreSQL', icon: 'db' },
        { text: 'Redis', icon: 'bolt' },
        { text: 'Kubernetes', icon: 'k8s' },
      ],
      backgroundColor: '#0f172a',
    },
    duration: 8,
  },

  'template-041': {
    templateId: 'template-041',
    elements: {
      title: 'Design with Purpose',
      subtitle: 'Minimalism is not about having less. It is about making room for more of what matters.',
      caption: 'Great design is about solving problems and creating meaningful experiences for the people who use your products every single day.',
      captionTimestamps: [
        { word: 'Great', start: 0.0, end: 0.3 },
        { word: 'design', start: 0.3, end: 0.6 },
        { word: 'is', start: 0.6, end: 0.8 },
        { word: 'about', start: 0.8, end: 1.0 },
        { word: 'solving', start: 1.0, end: 1.4 },
        { word: 'problems', start: 1.4, end: 1.8 },
        { word: 'and', start: 1.8, end: 2.0 },
        { word: 'creating', start: 2.0, end: 2.4 },
        { word: 'meaningful', start: 2.4, end: 2.9 },
        { word: 'experiences', start: 2.9, end: 3.4 },
        { word: 'for', start: 3.4, end: 3.6 },
        { word: 'the', start: 3.6, end: 3.8 },
        { word: 'people', start: 3.8, end: 4.1 },
        { word: 'who', start: 4.1, end: 4.3 },
        { word: 'use', start: 4.3, end: 4.5 },
        { word: 'your', start: 4.5, end: 4.7 },
        { word: 'products', start: 4.7, end: 5.1 },
        { word: 'every', start: 5.1, end: 5.4 },
        { word: 'single', start: 5.4, end: 5.7 },
        { word: 'day.', start: 5.7, end: 6.0 },
      ],
      backgroundColor: '#0d1117',
    },
    duration: 8,
  },

  'template-042': {
    templateId: 'template-042',
    elements: {
      title: 'The Future of AI',
      subtitle: 'Episode 42: Machine Learning in Production',
      hostName: 'Alex Rivera',
      hostImage: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face',
      caption: 'Artificial intelligence is not just a technology, it is a fundamental shift in how we approach problem solving across every industry.',
      captionTimestamps: [
        { word: 'Artificial', start: 0.0, end: 0.4 },
        { word: 'intelligence', start: 0.4, end: 0.9 },
        { word: 'is', start: 0.9, end: 1.1 },
        { word: 'not', start: 1.1, end: 1.3 },
        { word: 'just', start: 1.3, end: 1.5 },
        { word: 'a', start: 1.5, end: 1.6 },
        { word: 'technology,', start: 1.6, end: 2.1 },
        { word: 'it', start: 2.1, end: 2.3 },
        { word: 'is', start: 2.3, end: 2.5 },
        { word: 'a', start: 2.5, end: 2.6 },
        { word: 'fundamental', start: 2.6, end: 3.2 },
        { word: 'shift', start: 3.2, end: 3.6 },
        { word: 'in', start: 3.6, end: 3.8 },
        { word: 'how', start: 3.8, end: 4.0 },
        { word: 'we', start: 4.0, end: 4.2 },
        { word: 'approach', start: 4.2, end: 4.6 },
        { word: 'problem', start: 4.6, end: 5.0 },
        { word: 'solving', start: 5.0, end: 5.4 },
        { word: 'across', start: 5.4, end: 5.7 },
        { word: 'every', start: 5.7, end: 6.0 },
        { word: 'industry.', start: 6.0, end: 6.5 },
      ],
      backgroundColor: '#1a0a2e',
      accentColor: '#f97316',
    },
    duration: 8,
  },

  'template-043': {
    templateId: 'template-043',
    elements: {
      headline: 'AI Breakthrough',
      body: 'Scientists achieve a major milestone in quantum computing, opening new possibilities for drug discovery.',
      badge: 'BREAKING',
      image: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=1920&h=1080&fit=crop',
      caption: 'Researchers at the laboratory have successfully demonstrated a quantum processor that can solve complex molecular simulations in minutes rather than years.',
      captionTimestamps: [
        { word: 'Researchers', start: 0.0, end: 0.5 },
        { word: 'at', start: 0.5, end: 0.6 },
        { word: 'the', start: 0.6, end: 0.8 },
        { word: 'laboratory', start: 0.8, end: 1.3 },
        { word: 'have', start: 1.3, end: 1.5 },
        { word: 'successfully', start: 1.5, end: 2.0 },
        { word: 'demonstrated', start: 2.0, end: 2.6 },
        { word: 'a', start: 2.6, end: 2.7 },
        { word: 'quantum', start: 2.7, end: 3.2 },
        { word: 'processor', start: 3.2, end: 3.7 },
        { word: 'that', start: 3.7, end: 3.9 },
        { word: 'can', start: 3.9, end: 4.1 },
        { word: 'solve', start: 4.1, end: 4.4 },
        { word: 'complex', start: 4.4, end: 4.8 },
        { word: 'molecular', start: 4.8, end: 5.3 },
        { word: 'simulations', start: 5.3, end: 5.9 },
        { word: 'in', start: 5.9, end: 6.0 },
        { word: 'minutes', start: 6.0, end: 6.4 },
        { word: 'rather', start: 6.4, end: 6.7 },
        { word: 'than', start: 6.7, end: 6.9 },
        { word: 'years.', start: 6.9, end: 7.3 },
      ],
      backgroundColor: '#0a1628',
      accentColor: '#ef4444',
    },
    duration: 8,
  },

  'template-044': {
    templateId: 'template-044',
    elements: {
      title: 'Why AI is the Future',
      body: 'This changes everything...',
      profileImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
      username: 'techwithsarah',
      likes: '12400',
      caption: 'This is absolutely revolutionary and it is going to transform the way we think about technology forever mark my words.',
      captionTimestamps: [
        { word: 'This', start: 0.0, end: 0.2 },
        { word: 'is', start: 0.2, end: 0.4 },
        { word: 'absolutely', start: 0.4, end: 0.9 },
        { word: 'revolutionary', start: 0.9, end: 1.5 },
        { word: 'and', start: 1.5, end: 1.7 },
        { word: 'it', start: 1.7, end: 1.8 },
        { word: 'is', start: 1.8, end: 2.0 },
        { word: 'going', start: 2.0, end: 2.3 },
        { word: 'to', start: 2.3, end: 2.4 },
        { word: 'transform', start: 2.4, end: 2.9 },
        { word: 'the', start: 2.9, end: 3.0 },
        { word: 'way', start: 3.0, end: 3.3 },
        { word: 'we', start: 3.3, end: 3.4 },
        { word: 'think', start: 3.4, end: 3.7 },
        { word: 'about', start: 3.7, end: 4.0 },
        { word: 'technology', start: 4.0, end: 4.6 },
        { word: 'forever', start: 4.6, end: 5.1 },
        { word: 'mark', start: 5.1, end: 5.4 },
        { word: 'my', start: 5.4, end: 5.5 },
        { word: 'words.', start: 5.5, end: 5.9 },
      ],
      backgroundColor: '#1a0030',
      accentColor: '#ff6b9d',
    },
    duration: 8,
  },

  'template-045': {
    templateId: 'template-045',
    elements: {
      title: 'Into the Unknown',
      subtitle: 'A journey through dimensions beyond our own...',
      backgroundImage: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&h=1080&fit=crop',
      caption: 'What lies beyond the edge of our understanding is not darkness but endless possibility waiting to be discovered.',
      captionTimestamps: [
        { word: 'What', start: 0.0, end: 0.3 },
        { word: 'lies', start: 0.3, end: 0.6 },
        { word: 'beyond', start: 0.6, end: 1.0 },
        { word: 'the', start: 1.0, end: 1.1 },
        { word: 'edge', start: 1.1, end: 1.5 },
        { word: 'of', start: 1.5, end: 1.6 },
        { word: 'our', start: 1.6, end: 1.8 },
        { word: 'understanding', start: 1.8, end: 2.5 },
        { word: 'is', start: 2.5, end: 2.7 },
        { word: 'not', start: 2.7, end: 2.9 },
        { word: 'darkness', start: 2.9, end: 3.4 },
        { word: 'but', start: 3.4, end: 3.7 },
        { word: 'endless', start: 3.7, end: 4.2 },
        { word: 'possibility', start: 4.2, end: 4.9 },
        { word: 'waiting', start: 4.9, end: 5.3 },
        { word: 'to', start: 5.3, end: 5.4 },
        { word: 'be', start: 5.4, end: 5.6 },
        { word: 'discovered.', start: 5.6, end: 6.2 },
      ],
      backgroundColor: '#0a0a0a',
      textColor: '#f5f5f0',
    },
    duration: 8,
  },

  'template-046': {
    templateId: 'template-046',
    elements: {
      title: 'iPhone 16 Pro Review',
      subtitle: 'The most powerful iPhone yet',
      deviceImage: 'https://images.unsplash.com/photo-1592432678016-e910b452f9a2?w=400&h=300&fit=crop',
      specs: ['A18 Chip', '48MP Camera', '5G', 'OLED'],
      caption: 'The new processor delivers incredible performance gains and the camera system is simply unmatched in the smartphone market right now.',
      captionTimestamps: [
        { word: 'The', start: 0.0, end: 0.2 }, { word: 'new', start: 0.2, end: 0.4 }, { word: 'processor', start: 0.4, end: 0.9 },
        { word: 'delivers', start: 0.9, end: 1.3 }, { word: 'incredible', start: 1.3, end: 1.8 }, { word: 'performance', start: 1.8, end: 2.3 },
        { word: 'gains', start: 2.3, end: 2.6 }, { word: 'and', start: 2.6, end: 2.8 }, { word: 'the', start: 2.8, end: 2.9 },
        { word: 'camera', start: 2.9, end: 3.3 }, { word: 'system', start: 3.3, end: 3.6 }, { word: 'is', start: 3.6, end: 3.7 },
        { word: 'simply', start: 3.7, end: 4.1 }, { word: 'unmatched', start: 4.1, end: 4.6 }, { word: 'in', start: 4.6, end: 4.7 },
        { word: 'the', start: 4.7, end: 4.8 }, { word: 'smartphone', start: 4.8, end: 5.3 }, { word: 'market', start: 5.3, end: 5.6 },
        { word: 'right', start: 5.6, end: 5.8 }, { word: 'now.', start: 5.8, end: 6.1 },
      ],
      backgroundColor: '#0a0a1a',
      accentColor: '#22d3ee',
    },
    duration: 8,
  },

  'template-047': {
    templateId: 'template-047',
    elements: {
      quote: 'The only way to do great work is to love what you do.',
      author: 'Steve Jobs',
      caption: 'Passion is the fuel that drives innovation and excellence in everything we create and build together.',
      captionTimestamps: [
        { word: 'Passion', start: 0.0, end: 0.4 }, { word: 'is', start: 0.4, end: 0.5 }, { word: 'the', start: 0.5, end: 0.6 },
        { word: 'fuel', start: 0.6, end: 0.9 }, { word: 'that', start: 0.9, end: 1.1 }, { word: 'drives', start: 1.1, end: 1.4 },
        { word: 'innovation', start: 1.4, end: 2.0 }, { word: 'and', start: 2.0, end: 2.1 }, { word: 'excellence', start: 2.1, end: 2.7 },
        { word: 'in', start: 2.7, end: 2.8 }, { word: 'everything', start: 2.8, end: 3.3 }, { word: 'we', start: 3.3, end: 3.4 },
        { word: 'create', start: 3.4, end: 3.8 }, { word: 'and', start: 3.8, end: 3.9 }, { word: 'build', start: 3.9, end: 4.2 },
        { word: 'together.', start: 4.2, end: 4.7 },
      ],
      backgroundColor: '#0f0a1a',
      accentColor: '#fbbf24',
    },
    duration: 8,
  },

  'template-048': {
    templateId: 'template-048',
    elements: {
      title: 'The Future of Work',
      guestName: 'Dr. Maya Chen',
      guestTitle: 'CEO, Future Labs',
      guestImage: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop&crop=face',
      caption: 'Remote work is not just a trend, it is a fundamental shift in how we think about productivity and collaboration in the modern age.',
      captionTimestamps: [
        { word: 'Remote', start: 0.0, end: 0.3 }, { word: 'work', start: 0.3, end: 0.5 }, { word: 'is', start: 0.5, end: 0.6 },
        { word: 'not', start: 0.6, end: 0.8 }, { word: 'just', start: 0.8, end: 1.0 }, { word: 'a', start: 1.0, end: 1.1 },
        { word: 'trend,', start: 1.1, end: 1.5 }, { word: 'it', start: 1.5, end: 1.6 }, { word: 'is', start: 1.6, end: 1.7 },
        { word: 'a', start: 1.7, end: 1.8 }, { word: 'fundamental', start: 1.8, end: 2.4 }, { word: 'shift', start: 2.4, end: 2.7 },
        { word: 'in', start: 2.7, end: 2.8 }, { word: 'how', start: 2.8, end: 3.0 }, { word: 'we', start: 3.0, end: 3.1 },
        { word: 'think', start: 3.1, end: 3.4 }, { word: 'about', start: 3.4, end: 3.7 }, { word: 'productivity', start: 3.7, end: 4.3 },
        { word: 'and', start: 4.3, end: 4.4 }, { word: 'collaboration', start: 4.4, end: 5.1 }, { word: 'in', start: 5.1, end: 5.2 },
        { word: 'the', start: 5.2, end: 5.3 }, { word: 'modern', start: 5.3, end: 5.6 }, { word: 'age.', start: 5.6, end: 5.9 },
      ],
      backgroundColor: '#111827',
      accentColor: '#60a5fa',
    },
    duration: 8,
  },

  'template-049': {
    templateId: 'template-049',
    elements: {
      title: 'Getting Started with React',
      step: 'Step 1',
      body: 'Install Node.js and create your app',
      caption: 'First you need to install Node.js on your machine then run npx create react app my project to scaffold your application.',
      captionTimestamps: [
        { word: 'First', start: 0.0, end: 0.3 }, { word: 'you', start: 0.3, end: 0.4 }, { word: 'need', start: 0.4, end: 0.6 },
        { word: 'to', start: 0.6, end: 0.7 }, { word: 'install', start: 0.7, end: 1.1 }, { word: 'Node.js', start: 1.1, end: 1.5 },
        { word: 'on', start: 1.5, end: 1.6 }, { word: 'your', start: 1.6, end: 1.7 }, { word: 'machine', start: 1.7, end: 2.1 },
        { word: 'then', start: 2.1, end: 2.3 }, { word: 'run', start: 2.3, end: 2.5 }, { word: 'npx', start: 2.5, end: 2.7 },
        { word: 'create', start: 2.7, end: 3.0 }, { word: 'react', start: 3.0, end: 3.3 }, { word: 'app', start: 3.3, end: 3.5 },
        { word: 'my', start: 3.5, end: 3.6 }, { word: 'project', start: 3.6, end: 4.0 }, { word: 'to', start: 4.0, end: 4.1 },
        { word: 'scaffold', start: 4.1, end: 4.6 }, { word: 'your', start: 4.6, end: 4.7 }, { word: 'application.', start: 4.7, end: 5.3 },
      ],
      backgroundColor: '#0d1117',
      accentColor: '#22c55e',
    },
    duration: 8,
  },

  'template-050': {
    templateId: 'template-050',
    elements: {
      title: 'CYBERPUNK 2077',
      subtitle: 'New Expansion Dropping Soon',
      caption: 'The neon-lit streets of Night City are calling and a new chapter awaits those brave enough to answer the call.',
      captionTimestamps: [
        { word: 'The', start: 0.0, end: 0.2 }, { word: 'neon-lit', start: 0.2, end: 0.6 }, { word: 'streets', start: 0.6, end: 0.9 },
        { word: 'of', start: 0.9, end: 1.0 }, { word: 'Night', start: 1.0, end: 1.3 }, { word: 'City', start: 1.3, end: 1.6 },
        { word: 'are', start: 1.6, end: 1.7 }, { word: 'calling', start: 1.7, end: 2.1 }, { word: 'and', start: 2.1, end: 2.2 },
        { word: 'a', start: 2.2, end: 2.3 }, { word: 'new', start: 2.3, end: 2.5 }, { word: 'chapter', start: 2.5, end: 2.9 },
        { word: 'awaits', start: 2.9, end: 3.3 }, { word: 'those', start: 3.3, end: 3.5 }, { word: 'brave', start: 3.5, end: 3.8 },
        { word: 'enough', start: 3.8, end: 4.1 }, { word: 'to', start: 4.1, end: 4.2 }, { word: 'answer', start: 4.2, end: 4.6 },
        { word: 'the', start: 4.6, end: 4.7 }, { word: 'call.', start: 4.7, end: 5.0 },
      ],
      backgroundColor: '#0a0015',
      accentColor: '#ff00ff',
    },
    duration: 8,
  },

  'template-051': {
    templateId: 'template-051',
    elements: {
      title: 'Morning Workout',
      subtitle: 'Day 45 of 75 Hard',
      image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&h=200&fit=crop&crop=face',
      metric: '2,847',
      metricLabel: 'calories burned',
      caption: 'Consistency is key to achieving your fitness goals and every single rep brings you one step closer to the best version of yourself.',
      captionTimestamps: [
        { word: 'Consistency', start: 0.0, end: 0.5 }, { word: 'is', start: 0.5, end: 0.6 }, { word: 'key', start: 0.6, end: 0.8 },
        { word: 'to', start: 0.8, end: 0.9 }, { word: 'achieving', start: 0.9, end: 1.4 }, { word: 'your', start: 1.4, end: 1.5 },
        { word: 'fitness', start: 1.5, end: 1.9 }, { word: 'goals', start: 1.9, end: 2.2 }, { word: 'and', start: 2.2, end: 2.3 },
        { word: 'every', start: 2.3, end: 2.5 }, { word: 'single', start: 2.5, end: 2.8 }, { word: 'rep', start: 2.8, end: 3.0 },
        { word: 'brings', start: 3.0, end: 3.3 }, { word: 'you', start: 3.3, end: 3.4 }, { word: 'one', start: 3.4, end: 3.6 },
        { word: 'step', start: 3.6, end: 3.8 }, { word: 'closer', start: 3.8, end: 4.2 }, { word: 'to', start: 4.2, end: 4.3 },
        { word: 'the', start: 4.3, end: 4.4 }, { word: 'best', start: 4.4, end: 4.6 }, { word: 'version', start: 4.6, end: 5.0 },
        { word: 'of', start: 5.0, end: 5.1 }, { word: 'yourself.', start: 5.1, end: 5.6 },
      ],
      backgroundColor: '#0a0a0a',
      accentColor: '#ef4444',
    },
    duration: 8,
  },

  'template-052': {
    templateId: 'template-052',
    elements: {
      title: 'Homemade Pasta',
      subtitle: 'Italian Recipe',
      image: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=400&h=400&fit=crop',
      ingredients: ['Flour', 'Eggs', 'Olive Oil', 'Salt', 'Herbs'],
      caption: 'Making fresh pasta from scratch is easier than you think and the taste is absolutely incredible compared to store-bought alternatives.',
      captionTimestamps: [
        { word: 'Making', start: 0.0, end: 0.3 }, { word: 'fresh', start: 0.3, end: 0.6 }, { word: 'pasta', start: 0.6, end: 0.9 },
        { word: 'from', start: 0.9, end: 1.1 }, { word: 'scratch', start: 1.1, end: 1.5 }, { word: 'is', start: 1.5, end: 1.6 },
        { word: 'easier', start: 1.6, end: 2.0 }, { word: 'than', start: 2.0, end: 2.2 }, { word: 'you', start: 2.2, end: 2.3 },
        { word: 'think', start: 2.3, end: 2.6 }, { word: 'and', start: 2.6, end: 2.7 }, { word: 'the', start: 2.7, end: 2.8 },
        { word: 'taste', start: 2.8, end: 3.1 }, { word: 'is', start: 3.1, end: 3.2 }, { word: 'absolutely', start: 3.2, end: 3.7 },
        { word: 'incredible', start: 3.7, end: 4.3 }, { word: 'compared', start: 4.3, end: 4.7 }, { word: 'to', start: 4.7, end: 4.8 },
        { word: 'store-bought', start: 4.8, end: 5.4 }, { word: 'alternatives.', start: 5.4, end: 6.0 },
      ],
      backgroundColor: '#1a1410',
      accentColor: '#f59e0b',
    },
    duration: 8,
  },

  'template-053': {
    templateId: 'template-053',
    elements: {
      title: 'Santorini Sunset',
      location: 'Santorini, Greece',
      image: 'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=400&h=300&fit=crop',
      caption: 'There is nothing quite like watching the sun dip below the Aegean Sea from the white-washed cliffs of this magical Greek island.',
      captionTimestamps: [
        { word: 'There', start: 0.0, end: 0.2 }, { word: 'is', start: 0.2, end: 0.3 }, { word: 'nothing', start: 0.3, end: 0.6 },
        { word: 'quite', start: 0.6, end: 0.8 }, { word: 'like', start: 0.8, end: 1.0 }, { word: 'watching', start: 1.0, end: 1.4 },
        { word: 'the', start: 1.4, end: 1.5 }, { word: 'sun', start: 1.5, end: 1.7 }, { word: 'dip', start: 1.7, end: 1.9 },
        { word: 'below', start: 1.9, end: 2.2 }, { word: 'the', start: 2.2, end: 2.3 }, { word: 'Aegean', start: 2.3, end: 2.7 },
        { word: 'Sea', start: 2.7, end: 2.9 }, { word: 'from', start: 2.9, end: 3.1 }, { word: 'the', start: 3.1, end: 3.2 },
        { word: 'white-washed', start: 3.2, end: 3.8 }, { word: 'cliffs', start: 3.8, end: 4.1 }, { word: 'of', start: 4.1, end: 4.2 },
        { word: 'this', start: 4.2, end: 4.4 }, { word: 'magical', start: 4.4, end: 4.8 }, { word: 'Greek', start: 4.8, end: 5.1 },
        { word: 'island.', start: 5.1, end: 5.5 },
      ],
      backgroundColor: '#0a1628',
      accentColor: '#22d3ee',
    },
    duration: 8,
  },

  'template-054': {
    templateId: 'template-054',
    elements: {
      title: 'Einstein\'s Equation',
      formula: 'E = mc²',
      caption: 'Energy equals mass times the speed of light squared and this simple equation revolutionized our understanding of the entire universe.',
      captionTimestamps: [
        { word: 'Energy', start: 0.0, end: 0.3 }, { word: 'equals', start: 0.3, end: 0.6 }, { word: 'mass', start: 0.6, end: 0.8 },
        { word: 'times', start: 0.8, end: 1.0 }, { word: 'the', start: 1.0, end: 1.1 }, { word: 'speed', start: 1.1, end: 1.4 },
        { word: 'of', start: 1.4, end: 1.5 }, { word: 'light', start: 1.5, end: 1.8 }, { word: 'squared', start: 1.8, end: 2.2 },
        { word: 'and', start: 2.2, end: 2.3 }, { word: 'this', start: 2.3, end: 2.5 }, { word: 'simple', start: 2.5, end: 2.8 },
        { word: 'equation', start: 2.8, end: 3.3 }, { word: 'revolutionized', start: 3.3, end: 4.1 }, { word: 'our', start: 4.1, end: 4.2 },
        { word: 'understanding', start: 4.2, end: 4.9 }, { word: 'of', start: 4.9, end: 5.0 }, { word: 'the', start: 5.0, end: 5.1 },
        { word: 'entire', start: 5.1, end: 5.4 }, { word: 'universe.', start: 5.4, end: 5.9 },
      ],
      backgroundColor: '#0a1a0a',
      accentColor: '#34d399',
    },
    duration: 8,
  },

  'template-055': {
    templateId: 'template-055',
    elements: {
      title: 'Q4 Performance',
      subtitle: 'Revenue growth across all segments',
      chartData: [
        { label: 'Q1', value: 40 }, { label: 'Q2', value: 55 }, { label: 'Q3', value: 70 }, { label: 'Q4', value: 95 },
      ],
      caption: 'Our fourth quarter results exceeded expectations driven by strong product adoption and expansion into new international markets.',
      captionTimestamps: [
        { word: 'Our', start: 0.0, end: 0.2 }, { word: 'fourth', start: 0.2, end: 0.5 }, { word: 'quarter', start: 0.5, end: 0.8 },
        { word: 'results', start: 0.8, end: 1.2 }, { word: 'exceeded', start: 1.2, end: 1.6 }, { word: 'expectations', start: 1.6, end: 2.2 },
        { word: 'driven', start: 2.2, end: 2.5 }, { word: 'by', start: 2.5, end: 2.6 }, { word: 'strong', start: 2.6, end: 2.9 },
        { word: 'product', start: 2.9, end: 3.2 }, { word: 'adoption', start: 3.2, end: 3.6 }, { word: 'and', start: 3.6, end: 3.7 },
        { word: 'expansion', start: 3.7, end: 4.2 }, { word: 'into', start: 4.2, end: 4.4 }, { word: 'new', start: 4.4, end: 4.6 },
        { word: 'international', start: 4.6, end: 5.2 }, { word: 'markets.', start: 5.2, end: 5.6 },
      ],
      backgroundColor: '#0f172a',
      accentColor: '#3b82f6',
    },
    duration: 8,
  },

  'template-056': {
    templateId: 'template-056',
    elements: {
      title: 'Midnight Dreams',
      artist: 'Luna Eclipse',
      albumArt: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c6b?w=200&h=200&fit=crop',
      caption: 'This track takes you on a journey through ambient soundscapes with layers of synth that build into an unforgettable emotional crescendo.',
      captionTimestamps: [
        { word: 'This', start: 0.0, end: 0.2 }, { word: 'track', start: 0.2, end: 0.4 }, { word: 'takes', start: 0.4, end: 0.6 },
        { word: 'you', start: 0.6, end: 0.7 }, { word: 'on', start: 0.7, end: 0.8 }, { word: 'a', start: 0.8, end: 0.9 },
        { word: 'journey', start: 0.9, end: 1.3 }, { word: 'through', start: 1.3, end: 1.6 }, { word: 'ambient', start: 1.6, end: 2.0 },
        { word: 'soundscapes', start: 2.0, end: 2.6 }, { word: 'with', start: 2.6, end: 2.8 }, { word: 'layers', start: 2.8, end: 3.1 },
        { word: 'of', start: 3.1, end: 3.2 }, { word: 'synth', start: 3.2, end: 3.5 }, { word: 'that', start: 3.5, end: 3.7 },
        { word: 'build', start: 3.7, end: 4.0 }, { word: 'into', start: 4.0, end: 4.2 }, { word: 'an', start: 4.2, end: 4.3 },
        { word: 'unforgettable', start: 4.3, end: 5.0 }, { word: 'emotional', start: 5.0, end: 5.5 }, { word: 'crescendo.', start: 5.5, end: 6.1 },
      ],
      backgroundColor: '#0a0a1a',
      accentColor: '#a855f7',
    },
    duration: 8,
  },

  'template-057': {
    templateId: 'template-057',
    elements: {
      title: 'Quantum Entanglement',
      subtitle: 'How particles communicate instantly across vast distances',
      image: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&h=400&fit=crop',
      caption: 'Quantum entanglement is one of the most fascinating phenomena in physics where two particles remain connected regardless of the distance between them.',
      captionTimestamps: [
        { word: 'Quantum', start: 0.0, end: 0.4 }, { word: 'entanglement', start: 0.4, end: 1.1 }, { word: 'is', start: 1.1, end: 1.2 },
        { word: 'one', start: 1.2, end: 1.4 }, { word: 'of', start: 1.4, end: 1.5 }, { word: 'the', start: 1.5, end: 1.6 },
        { word: 'most', start: 1.6, end: 1.8 }, { word: 'fascinating', start: 1.8, end: 2.4 }, { word: 'phenomena', start: 2.4, end: 2.9 },
        { word: 'in', start: 2.9, end: 3.0 }, { word: 'physics', start: 3.0, end: 3.4 }, { word: 'where', start: 3.4, end: 3.6 },
        { word: 'two', start: 3.6, end: 3.8 }, { word: 'particles', start: 3.8, end: 4.3 }, { word: 'remain', start: 4.3, end: 4.6 },
        { word: 'connected', start: 4.6, end: 5.1 }, { word: 'regardless', start: 5.1, end: 5.6 }, { word: 'of', start: 5.6, end: 5.7 },
        { word: 'the', start: 5.7, end: 5.8 }, { word: 'distance', start: 5.8, end: 6.2 }, { word: 'between', start: 6.2, end: 6.5 },
        { word: 'them.', start: 6.5, end: 6.8 },
      ],
      backgroundColor: '#0a1628',
      accentColor: '#06b6d4',
    },
    duration: 8,
  },

  'template-058': {
    templateId: 'template-058',
    elements: {
      title: 'The Silent Forest',
      body: 'In the heart of the ancient woods, where sunlight filters through the canopy like golden threads...',
      chapter: 'Chapter One',
      caption: 'The forest held secrets that no living soul had ever uncovered and she was determined to be the first to discover them all.',
      captionTimestamps: [
        { word: 'The', start: 0.0, end: 0.2 }, { word: 'forest', start: 0.2, end: 0.5 }, { word: 'held', start: 0.5, end: 0.7 },
        { word: 'secrets', start: 0.7, end: 1.1 }, { word: 'that', start: 1.1, end: 1.3 }, { word: 'no', start: 1.3, end: 1.4 },
        { word: 'living', start: 1.4, end: 1.7 }, { word: 'soul', start: 1.7, end: 1.9 }, { word: 'had', start: 1.9, end: 2.1 },
        { word: 'ever', start: 2.1, end: 2.3 }, { word: 'uncovered', start: 2.3, end: 2.8 }, { word: 'and', start: 2.8, end: 2.9 },
        { word: 'she', start: 2.9, end: 3.1 }, { word: 'was', start: 3.1, end: 3.2 }, { word: 'determined', start: 3.2, end: 3.7 },
        { word: 'to', start: 3.7, end: 3.8 }, { word: 'be', start: 3.8, end: 3.9 }, { word: 'the', start: 3.9, end: 4.0 },
        { word: 'first', start: 4.0, end: 4.3 }, { word: 'to', start: 4.3, end: 4.4 }, { word: 'discover', start: 4.4, end: 4.8 },
        { word: 'them', start: 4.8, end: 5.0 }, { word: 'all.', start: 5.0, end: 5.2 },
      ],
      backgroundColor: '#1a1510',
      accentColor: '#d4a574',
    },
    duration: 8,
  },

  'template-059': {
    templateId: 'template-059',
    elements: {
      title: 'Tech Summit 2026',
      speaker: 'Featuring: Sundar Pichai',
      date: 'March 15-17, 2026 • San Francisco',
      image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face',
      caption: 'Join thousands of developers and industry leaders for three days of innovation networking and hands-on workshops at the biggest tech event of the year.',
      captionTimestamps: [
        { word: 'Join', start: 0.0, end: 0.2 }, { word: 'thousands', start: 0.2, end: 0.6 }, { word: 'of', start: 0.6, end: 0.7 },
        { word: 'developers', start: 0.7, end: 1.2 }, { word: 'and', start: 1.2, end: 1.3 }, { word: 'industry', start: 1.3, end: 1.7 },
        { word: 'leaders', start: 1.7, end: 2.1 }, { word: 'for', start: 2.1, end: 2.2 }, { word: 'three', start: 2.2, end: 2.4 },
        { word: 'days', start: 2.4, end: 2.6 }, { word: 'of', start: 2.6, end: 2.7 }, { word: 'innovation', start: 2.7, end: 3.2 },
        { word: 'networking', start: 3.2, end: 3.7 }, { word: 'and', start: 3.7, end: 3.8 }, { word: 'hands-on', start: 3.8, end: 4.3 },
        { word: 'workshops', start: 4.3, end: 4.8 }, { word: 'at', start: 4.8, end: 4.9 }, { word: 'the', start: 4.9, end: 5.0 },
        { word: 'biggest', start: 5.0, end: 5.4 }, { word: 'tech', start: 5.4, end: 5.6 }, { word: 'event', start: 5.6, end: 5.9 },
        { word: 'of', start: 5.9, end: 6.0 }, { word: 'the', start: 6.0, end: 6.1 }, { word: 'year.', start: 6.1, end: 6.4 },
      ],
      backgroundColor: '#0a0a0a',
      accentColor: '#f59e0b',
    },
    duration: 8,
  },

  'template-060': {
    templateId: 'template-060',
    elements: {
      title: 'That Awkward Moment',
      subtitle: 'When you realize the meeting could have been an email',
      emoji: '😂',
      image: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=200&h=200&fit=crop&crop=face',
      caption: 'You sit through a two hour meeting about nothing and then they send a recap email that could have been read in thirty seconds flat.',
      captionTimestamps: [
        { word: 'You', start: 0.0, end: 0.1 }, { word: 'sit', start: 0.1, end: 0.3 }, { word: 'through', start: 0.3, end: 0.5 },
        { word: 'a', start: 0.5, end: 0.6 }, { word: 'two', start: 0.6, end: 0.7 }, { word: 'hour', start: 0.7, end: 0.9 },
        { word: 'meeting', start: 0.9, end: 1.3 }, { word: 'about', start: 1.3, end: 1.5 }, { word: 'nothing', start: 1.5, end: 1.8 },
        { word: 'and', start: 1.8, end: 1.9 }, { word: 'then', start: 1.9, end: 2.1 }, { word: 'they', start: 2.1, end: 2.2 },
        { word: 'send', start: 2.2, end: 2.4 }, { word: 'a', start: 2.4, end: 2.5 }, { word: 'recap', start: 2.5, end: 2.8 },
        { word: 'email', start: 2.8, end: 3.1 }, { word: 'that', start: 3.1, end: 3.3 }, { word: 'could', start: 3.3, end: 3.5 },
        { word: 'have', start: 3.5, end: 3.6 }, { word: 'been', start: 3.6, end: 3.8 }, { word: 'read', start: 3.8, end: 4.0 },
        { word: 'in', start: 4.0, end: 4.1 }, { word: 'thirty', start: 4.1, end: 4.4 }, { word: 'seconds', start: 4.4, end: 4.8 },
        { word: 'flat.', start: 4.8, end: 5.1 },
      ],
      backgroundColor: '#1a0a0a',
      accentColor: '#facc15',
    },
    duration: 8,
  },
};
