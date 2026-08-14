import { typography, palette } from '../../theme';

export const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
    padding: 0,
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
  },
  imagePanel: {
    flex: 1.2,
    position: 'relative',
    overflow: 'hidden',
  },
  storyImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  textPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '60px 50px',
    position: 'relative',
    zIndex: 2,
  },
  stepBadge: {
    display: 'inline-block',
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    color: palette.accentSolid,
    fontSize: 16,
    fontWeight: 600,
    padding: '6px 16px',
    borderRadius: 20,
    marginBottom: 20,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Migrated to theme.js typography tokens (fontFamily/lineHeight/weight)
  // so title/body read consistently with the other 4 templates, while
  // keeping this template's own left-aligned sizing.
  title: {
    ...typography.title,
    color: palette.textOnDark,
    fontSize: 44,
    fontWeight: 700,
    textAlign: 'left',
    lineHeight: 1.2,
    marginBottom: 16,
  },
  body: {
    ...typography.body,
    color: palette.textMuted,
    fontSize: 24,
    maxWidth: '90%',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'linear-gradient(90deg, rgba(15,23,42,0.6) 0%, transparent 100%)',
    zIndex: 1,
  },
};
