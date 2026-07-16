export const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '60px 80px',
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden',
  },
  title: { color: '#ffffff', fontSize: 44, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { color: '#94a3b8', fontSize: 24, marginBottom: 40 },
  factRow: {
    display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 20,
    padding: '18px 24px', backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12, marginBottom: 12,
  },
  factIcon: { fontSize: 36, minWidth: 50, textAlign: 'center' },
  factContent: { flex: 1 },
  factTitle: { color: '#fbbf24', fontSize: 20, fontWeight: 600, marginBottom: 4 },
  factDesc: { color: '#cbd5e1', fontSize: 20, lineHeight: 1.3 },
};
