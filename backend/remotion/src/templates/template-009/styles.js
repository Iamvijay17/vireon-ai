import { spacing } from '../../theme';

export const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: `${spacing.xxl}px ${spacing.xxxl}px`,
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
  },
  title: {
    color: '#ffffff',
    fontSize: 56,
    fontWeight: 300,
    marginBottom: spacing.xl,
  },
  // Plain rows - no card chrome, no icon badges.
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    width: '100%',
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  bulletDot: {
    flexShrink: 0,
    width: 10,
    height: 10,
    borderRadius: '50%',
    backgroundColor: '#60a5fa',
    marginTop: 12,
  },
  heading: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: 600,
    marginBottom: 2,
  },
  text: {
    color: '#e2e8f0',
    fontSize: 24,
    fontWeight: 400,
    lineHeight: 1.4,
  },
};
