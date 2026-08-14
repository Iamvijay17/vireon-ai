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
  list: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '88%',
  },
  entry: {
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  divider: {
    width: '100%',
    height: 1,
    background: 'rgba(148,163,184,0.25)',
  },
  term: {
    color: palette.textOnDark,
    fontSize: 32,
    fontWeight: 700,
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    margin: 0,
    marginBottom: 6,
  },
  definition: {
    color: palette.textMuted,
    fontSize: 22,
    fontWeight: 400,
    fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    lineHeight: 1.5,
    margin: 0,
  },
};
