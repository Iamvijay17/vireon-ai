export const styles = {
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    boxSizing: 'border-box',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    // Percentage-of-canvas width (capped so it doesn't balloon on very wide
    // landscape canvases) instead of a fixed 560px, so the card doesn't
    // shrink to a small fraction of a narrower portrait/square frame.
    position: 'relative',
    width: '70%',
    maxWidth: 560,
    backgroundColor: '#fafafa',
    padding: '24px 24px 90px',
    boxSizing: 'border-box',
    boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
  },
  photo: {
    // Aspect-ratio-driven instead of a fixed 480px height, so the photo
    // keeps the same shape as the card scales with `card.width` above.
    width: '100%',
    aspectRatio: '560 / 480',
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  strip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    textAlign: 'center',
    padding: '0 30px',
  },
  label: {
    color: '#9a8f7a',
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  caption: {
    color: '#2b2b2b',
    fontSize: 24,
    fontWeight: 400,
    fontFamily: "'Segoe Print', 'Comic Sans MS', cursive",
    lineHeight: 1.3,
    margin: 0,
  },
};
