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
  accentLine: {
    width: 80,
    height: 3,
    borderRadius: 2,
    background: palette.accentGradient,
    marginBottom: spacing.lg,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    width: '100%',
    maxWidth: '85%',
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  bulletDot: {
    flexShrink: 0,
    width: 12,
    height: 12,
    borderRadius: '50%',
    background: palette.accentGradient,
    marginTop: 10,
  },
};
