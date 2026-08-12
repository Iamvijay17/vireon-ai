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
    alignItems: 'center',
    padding: `${spacing.xxl}px ${spacing.xxxl}px`,
    boxSizing: 'border-box',
  },
  accentLine: {
    width: 80,
    height: 3,
    borderRadius: 2,
    background: palette.accentGradient,
    marginBottom: spacing.xl,
  },
  columns: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.xxl,
    width: '100%',
    maxWidth: '85%',
  },
  column: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  columnHeading: {
    marginBottom: spacing.sm,
  },
  imageWrapper: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
};
