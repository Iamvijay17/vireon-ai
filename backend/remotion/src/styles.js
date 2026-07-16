/**
 * Shared styles for templates
 */

export const backgroundColors = {
  dark: '#1a1a2e',
  navy: '#16213e',
  slate: '#0f3460',
  teal: '#1a936f',
  warm: '#2d1b2e',
  clean: '#0d1117',
  gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
};

export const textStyles = {
  title: {
    color: '#ffffff',
    fontSize: 64,
    fontWeight: 'bold',
    textAlign: 'center',
    margin: 0,
    padding: 0,
    lineHeight: 1.2,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 32,
    textAlign: 'center',
    margin: 0,
    padding: 0,
    lineHeight: 1.4,
  },
  body: {
    color: '#cbd5e1',
    fontSize: 28,
    textAlign: 'center',
    margin: 0,
    padding: 0,
    lineHeight: 1.6,
  },
  accent: {
    color: '#60a5fa',
    fontSize: 40,
    fontWeight: 'bold',
    textAlign: 'center',
    margin: 0,
    padding: 0,
  },
  label: {
    color: '#f59e0b',
    fontSize: 24,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2,
    margin: 0,
    padding: 0,
  },
};

export const layoutStyles = {
  flexCenter: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flexRow: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '100%',
    height: '100%',
    padding: 60,
    boxSizing: 'border-box',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 40,
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  imageFit: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
};

export const accentColors = {
  blue: '#60a5fa',
  green: '#34d399',
  purple: '#a78bfa',
  orange: '#fb923c',
  pink: '#f472b6',
  yellow: '#fbbf24',
  cyan: '#22d3ee',
  red: '#f87171',
  white: '#ffffff',
};
