import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { backgroundColors } from '../../styles';

const styles = {
  container: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '60px 80px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' },
  badge: { backgroundColor: 'rgba(96,165,250,0.15)', color: '#60a5fa', fontSize: 16, fontWeight: 600, padding: '6px 18px', borderRadius: 20, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: '#ffffff', fontSize: 48, fontWeight: 'bold', textAlign: 'center', marginBottom: 16, maxWidth: '85%' },
  body: { color: '#94a3b8', fontSize: 26, textAlign: 'center', lineHeight: 1.5, maxWidth: '75%', marginBottom: 30 },
  statRow: { display: 'flex', flexDirection: 'row', gap: 40, justifyContent: 'center' },
  statItem: { textAlign: 'center' },
  statValue: { color: '#fbbf24', fontSize: 40, fontWeight: 'bold' },
  statLabel: { color: '#94a3b8', fontSize: 18 },
};

import { useFadeInOut, useSlideUp } from '../../animations';
const useAnim = ({ frameOffset = 0 } = {}) => {
  const bgFade = useFadeInOut({ fadeIn: frameOffset, fadeInDuration: 10 });
  const bFade = useFadeInOut({ fadeIn: frameOffset + 5, fadeInDuration: 10 });
  const tSlide = useSlideUp({ startAt: frameOffset + 10, distance: 50 });
  const bodySlide = useSlideUp({ startAt: frameOffset + 18, distance: 40 });
  const sFade = useFadeInOut({ fadeIn: frameOffset + 28, fadeInDuration: 15 });
  return { bgStyle: { opacity: bgFade }, badgeStyle: { opacity: bFade }, titleStyle: tSlide, bodyStyle: bodySlide, statStyle: { opacity: sFade } };
};

const Template030 = React.memo(({ scene }) => {
  const e = scene?.elements || {};
  const title = e.title || ''; const body = e.body || e.text || ''; const badge = e.badge || '';
  const stats = e.stats || e.items || []; const bgColor = e.backgroundColor || backgroundColors.slate;
  const anim = useAnim({ frameOffset: 0 });
  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {badge && <div style={{ ...styles.badge, ...anim.badgeStyle }}>{badge}</div>}
        {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        {body && <p style={{ ...styles.body, ...anim.bodyStyle }}>{body}</p>}
        {stats.length > 0 && <div style={{ ...styles.statRow, ...anim.statStyle }}>{stats.map((s, i) => <div key={i} style={styles.statItem}><div style={styles.statValue}>{s.value}</div><div style={styles.statLabel}>{s.label}</div></div>)}</div>}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});
Template030.displayName = 'Template030';
export default Template030;
