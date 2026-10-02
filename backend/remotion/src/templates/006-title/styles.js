import { typography, palette } from '../../theme';

export const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'row',
    position: 'relative',
    overflow: 'hidden',
  },
  imageHalf: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  textHalf: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '0 70px',
    boxSizing: 'border-box',
  },
  title: {
    ...typography.title,
    color: palette.textOnDark,
    fontSize: 58,
    fontWeight: 600,
    textAlign: 'left',
    lineHeight: 1.15,
    marginBottom: 20,
  },
  subtitle: {
    ...typography.subtitle,
    textAlign: 'left',
    fontSize: 26,
    maxWidth: '90%',
  },
};
