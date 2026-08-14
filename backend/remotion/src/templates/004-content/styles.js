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
    width: 60,
    height: 4,
    borderRadius: 2,
    background: palette.accentGradient,
    marginBottom: spacing.lg,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.md,
    width: '100%',
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  checkBadge: {
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: palette.accentGradient,
    marginTop: 2,
  },
  checkIcon: {
    width: 16,
    height: 16,
    color: '#0d1117',
  },
};
