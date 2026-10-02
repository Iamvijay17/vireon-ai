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
  colorHalf: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '0 70px',
    boxSizing: 'border-box',
  },
  label: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 16,
    fontWeight: 700,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  caption: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: 700,
    lineHeight: 1.28,
    margin: 0,
  },
};
