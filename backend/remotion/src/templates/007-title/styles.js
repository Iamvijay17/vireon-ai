import { typography } from '../../theme';

export const styles = {
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
  },
  ribbon: {
    height: 54,
    display: 'flex',
    alignItems: 'center',
    padding: '0 60px',
  },
  kicker: {
    color: '#0d1117',
    fontSize: 18,
    fontWeight: 800,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  thumb: {
    position: 'absolute',
    top: 90,
    right: 60,
    width: 200,
    height: 150,
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
    border: '3px solid rgba(255,255,255,0.9)',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  textBlock: {
    marginTop: 'auto',
    padding: '0 60px 80px',
    boxSizing: 'border-box',
  },
  title: {
    ...typography.title,
    textAlign: 'left',
    fontSize: 84,
    fontWeight: 700,
    lineHeight: 1.05,
    letterSpacing: '-0.01em',
    marginBottom: 20,
  },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'left',
    fontSize: 28,
    maxWidth: '70%',
  },
};
