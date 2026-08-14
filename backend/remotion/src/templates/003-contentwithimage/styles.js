import { typography, palette } from '../../theme';

export const styles = {
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.94) 100%)',
    zIndex: 1,
  },
  textPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2,
    padding: '0 100px 90px',
    boxSizing: 'border-box',
  },
  badge: {
    display: 'inline-block',
    color: '#fbbf24',
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  title: {
    ...typography.title,
    color: palette.textOnDark,
    fontSize: 58,
    fontWeight: 700,
    textAlign: 'left',
    lineHeight: 1.15,
    marginBottom: 18,
    textShadow: '0 4px 20px rgba(0,0,0,0.55)',
  },
  body: {
    ...typography.body,
    color: '#e2e8f0',
    fontSize: 26,
    maxWidth: '75%',
  },
};
