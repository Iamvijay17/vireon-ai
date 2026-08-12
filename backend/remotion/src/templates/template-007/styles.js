import { spacing } from '../../theme';

export const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
  },
  title: {
    color: '#ffffff',
    fontSize: 56,
    fontWeight: 300,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  // Plain row list - no stat cards, no glassmorphism, no icon badges.
  statList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.lg,
    width: '100%',
    maxWidth: '70%',
  },
  statRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    paddingBottom: spacing.sm,
  },
  statValue: {
    color: '#60a5fa',
    fontSize: 44,
    fontWeight: 600,
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 22,
    fontWeight: 400,
  },
};
