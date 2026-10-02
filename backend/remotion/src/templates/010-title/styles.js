import { typography } from '../../theme';

export const styles = {
  outer: {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    padding: 40,
  },
  frame: {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    border: '2px solid rgba(148,163,184,0.35)',
    borderRadius: 6,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '46px 60px',
    overflow: 'hidden',
  },
  artArea: {
    width: '58%',
    height: '58%',
    borderRadius: 4,
    overflow: 'hidden',
    boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
    marginBottom: 34,
  },
  artImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  textBlock: {
    textAlign: 'center',
    maxWidth: '80%',
  },
  title: {
    ...typography.title,
    textAlign: 'center',
    fontSize: 56,
    fontWeight: 600,
    lineHeight: 1.15,
    marginBottom: 16,
  },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'center',
    fontSize: 24,
  },
};
