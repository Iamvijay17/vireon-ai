import { spacing, palette } from '../../theme';

export const styles = {
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: `${spacing.xxl}px ${spacing.xxxl}px`,
    boxSizing: 'border-box',
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xl,
    width: '100%',
    maxWidth: '80%',
  },
  paragraphBlock: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.md,
  },
  markerLine: {
    flexShrink: 0,
    width: 3,
    borderRadius: 2,
    background: palette.accentGradient,
  },
  paragraphHeading: {
    color: palette.textOnDark,
    fontSize: 28,
    fontWeight: 600,
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    margin: 0,
    marginBottom: spacing.xs,
  },
  paragraphText: {
    color: palette.textMuted,
    fontSize: 25,
    fontWeight: 400,
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    lineHeight: 1.6,
    margin: 0,
  },
};
