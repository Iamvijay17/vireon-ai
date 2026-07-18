import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const metadata = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/templates/index.json'), 'utf8'));

const sampleScenes = {};

metadata.forEach(t => {
  const tid = t.templateId;
  const base = {
    title: t.title,
    subtitle: `A preview of the ${t.title.toLowerCase()} template in action.`,
    backgroundColor: '#1a1a2e',
  };

  const templateSamples = {
    'template-001': { ...base, image: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=800&h=600&fit=crop' },
    'template-002': { question: 'What is Artificial Intelligence?', answer: 'AI is the simulation of human intelligence by machines.', questionIcon: '❓', answerIcon: '💡' },
    'template-003': { image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop', caption: 'The Milky Way stretches across the night sky.', label: 'Featured' },
    'template-004': { title: 'Project Milestones', items: [{ date: 'Q1 2024', text: 'Research & Planning' }, { date: 'Q2 2024', text: 'Development Phase' }, { date: 'Q3 2024', text: 'Testing & QA' }] },
    'template-005': { header: 'Framework Comparison', leftCard: { title: 'React', body: 'Component-based UI library', icon: '⚛️' }, rightCard: { title: 'Vue', body: 'Progressive framework', icon: '💚' } },
    'template-006': { quote: 'The only way to do great work is to love what you do.', author: 'Steve Jobs', authorTitle: 'Apple Co-founder' },
    'template-007': { title: 'Performance Metrics', stats: [{ value: '99.9%', label: 'Uptime' }, { value: '2.5M', label: 'Users' }, { value: '50ms', label: 'Latency' }] },
    'template-008': { title: 'Tech Stack', items: [{ text: 'React', icon: '⚛️' }, { text: 'Node.js', icon: '🟢' }, { text: 'TypeScript', icon: '📘' }, { text: 'AWS', icon: '☁️' }] },
    'template-009': { title: 'Key Takeaways', items: [{ text: 'AI is transforming every industry', icon: '🌟' }, { text: 'Data-driven decisions outperform by 85%', icon: '✅' }, { text: 'Automation reduces costs by 40%', icon: '💡' }] },
    'template-010': { title: 'Welcome to the Future', subtitle: 'Innovation at scale', stats: [{ value: '10K+', label: 'Users' }, { value: '99%', label: 'Satisfaction' }] },
    'template-011': { title: 'Our Team', members: [{ name: 'Alice Chen', role: 'CEO', bio: 'Visionary leader' }, { name: 'Bob Smith', role: 'CTO', bio: 'Tech architect' }] },
    'template-012': { title: 'Launch Countdown', message: 'Get ready for something amazing!', timeBlocks: [{ value: '07', label: 'Days' }, { value: '12', label: 'Hours' }, { value: '45', label: 'Minutes' }, { value: '30', label: 'Seconds' }] },
    'template-013': { title: 'Getting Started', emoji: '🚀', steps: [{ title: 'Install', description: 'Download the package' }, { title: 'Configure', description: 'Set up your environment' }, { title: 'Deploy', description: 'Launch to production' }] },
    'template-014': { title: 'Quarterly Revenue', bars: [{ label: 'Q1', value: '45' }, { label: 'Q2', value: '68' }, { label: 'Q3', value: '82' }, { label: 'Q4', value: '95' }] },
    'template-015': { title: 'Core Features', features: [{ icon: '🚀', title: 'Fast', description: 'Lightning quick performance' }, { icon: '🔒', title: 'Secure', description: 'Enterprise-grade security' }, { icon: '☁️', title: 'Cloud', description: 'Fully managed cloud' }] },
    'template-016': { images: [{ url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop' }, { url: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=400&h=300&fit=crop' }, { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop' }, { url: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=400&h=300&fit=crop' }], caption: 'Beautiful moments captured', subtitle: 'Photo gallery' },
    'template-017': { ...base, body: 'A journey through innovation and discovery.', image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop', badge: 'Story' },
    'template-018': { images: [{ url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop' }, { url: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=400&h=300&fit=crop' }, { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop' }], caption: 'Masonry gallery' },
    'template-019': { ...base, image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop', cta: 'Learn More →' },
    'template-020': { ...base, body: 'An inspiring story of growth.', image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop', label: 'Featured Story' },
    'template-021': { ...base, body: 'In the heart of the city, a revolution was brewing.' },
    'template-022': { title: 'Summer Memories', photos: [{ url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=400&fit=crop', caption: 'Sunset' }, { url: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=400&h=400&fit=crop', caption: 'Adventure' }] },
    'template-023': { title: 'Our Journey', cards: [{ image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=300&fit=crop', title: 'The Beginning', description: 'Where it all started' }, { image: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=400&h=300&fit=crop', title: 'Growth', description: 'Scaling new heights' }] },
    'template-024': { ...base, label: 'Before & After', topImage: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=400&fit=crop', bottomImage: 'https://images.unsplash.com/photo-1614732414444-096e5f1122d5?w=800&h=400&fit=crop' },
    'template-025': { ...base, body: 'Revealing something extraordinary.', image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop', tag: 'New' },
    'template-026': { term: 'API', title: 'Application Programming Interface', definition: 'A set of protocols for building software applications.', example: 'REST, GraphQL' },
    'template-027': { title: 'Project Checklist', points: [{ text: 'Requirements gathered', icon: '✓' }, { text: 'Design approved', icon: '✓' }, { text: 'Development complete', icon: '○' }] },
    'template-028': { ...base, headers: ['Feature', 'Basic', 'Pro'], rows: [{ cells: ['Storage', '10GB', '100GB'] }, { cells: ['Users', '5', 'Unlimited'] }] },
    'template-029': { title: 'Did You Know?', subtitle: 'Interesting facts', facts: [{ icon: '🌍', title: 'Earth', description: '70% covered by water' }, { icon: '🧠', title: 'Brain', description: 'Uses 20% of oxygen' }] },
    'template-030': { badge: 'Summary', ...base, body: 'Key findings from our analysis.', stats: [{ value: '85%', label: 'Growth' }, { value: '2.5x', label: 'ROI' }] },
    'template-031': { title: 'Expert Insight', meta: 'Research', quote: 'Innovation distinguishes between a leader and a follower.', author: 'Steve Jobs', source: 'Apple' },
    'template-032': { ...base, steps: [{ num: 1, title: 'Research', description: 'Understand the problem' }, { num: 2, title: 'Design', description: 'Create the solution' }, { num: 3, title: 'Launch', description: 'Deploy to users' }] },
    'template-033': { ...base, items: [{ icon: '⚡', title: 'Lightning Fast', description: '10x performance improvement' }, { icon: '🛡️', title: 'Secure', description: 'End-to-end encryption' }] },
    'template-034': { title: 'Learning Path', items: [{ level: 'Beginner', title: 'Basics', description: 'Core concepts', tags: ['intro'] }, { level: 'Advanced', title: 'Mastery', description: 'Deep dive', tags: ['expert'] }] },
    'template-035': { ...base, items: [{ text: 'JavaScript', icon: '📜' }, { text: 'Python', icon: '🐍' }, { text: 'Go', icon: '🔷' }] },
    'template-036': { label: 'Case Study', ...base, body: 'How Company X achieved 300% growth.', image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop', stat: '300%' },
    'template-037': { title: 'Company Milestones', sub: 'Our journey so far', items: [{ year: '2020', title: 'Founded', description: 'Started with a vision' }, { year: '2022', title: '1M Users', description: 'Major milestone' }] },
    'template-038': { title: 'Business Metrics', items: [{ icon: '📈', title: 'Revenue', description: '$2.5M ARR' }, { icon: '👥', title: 'Users', description: '50K active' }] },
    'template-039': { name: 'Dr. Sarah Johnson', role: 'Chief Technology Officer', bio: '20+ years in tech innovation', image: '', stats: [{ value: '50+', label: 'Projects' }, { value: '15', label: 'Patents' }] },
    'template-040': { ...base, items: [{ text: 'React', icon: '⚛️' }, { text: 'Node.js', icon: '🟢' }, { text: 'TypeScript', icon: '📘' }] },
    'template-041': { ...base, caption: 'Simplicity is the ultimate sophistication.' },
    'template-042': { ...base, hostName: 'Alex Rivera', hostImage: '', caption: 'Welcome to another episode of Tech Talks!' },
    'template-043': { headline: 'Breaking News', body: 'Major breakthrough in AI technology announced today.', badge: 'Exclusive', image: '' },
    'template-044': { ...base, body: 'Check out our latest feature!', profileImage: '', username: '@techcompany', likes: '12.5K' },
    'template-045': { ...base, backgroundImage: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop' },
    'template-046': { ...base, deviceImage: '', specs: ['5G', 'AI-Powered', '8K Display'] },
    'template-047': { quote: 'Believe you can and you are halfway there.', author: 'Theodore Roosevelt' },
    'template-048': { ...base, guestName: 'Dr. Maya Patel', guestTitle: 'AI Researcher', guestImage: '' },
    'template-049': { ...base, step: 'Step 1', body: 'Follow these simple instructions to get started.' },
    'template-050': { ...base, caption: 'Level up your skills!' },
    'template-051': { ...base, image: '', metric: '10K', metricLabel: 'Calories Burned' },
    'template-052': { ...base, image: '', ingredients: ['Flour', 'Eggs', 'Sugar', 'Butter'] },
    'template-053': { ...base, location: 'Paris, France', image: '' },
    'template-054': { ...base, formula: 'E = mc²' },
    'template-055': { ...base, image: '', stats: [{ value: '500+', label: 'Clients' }, { value: '99%', label: 'Retention' }] },
    'template-056': { ...base },
    'template-057': { ...base, image: '' },
    'template-058': { ...base, body: 'Once upon a time...', image: '' },
    'template-059': { ...base, image: '', date: 'December 15, 2024' },
    'template-060': { ...base, caption: 'Why did the developer go broke?' },
  };

  const elements = templateSamples[tid] || base;
  sampleScenes[tid] = {
    templateId: tid,
    elements,
    duration: 8,
  };
});

// Generate JSX export
const sampleDataPath = path.join(rootDir, 'src/sampleData.js');
fs.writeFileSync(sampleDataPath, `/**
 * Sample scene data for previewing templates in Remotion Studio.
 * Auto-generated for all 60 templates.
 */

export const sampleScenes = ${JSON.stringify(sampleScenes, null, 2)};
`);

console.log(`Generated ${sampleDataPath} with ${Object.keys(sampleScenes).length} templates`);