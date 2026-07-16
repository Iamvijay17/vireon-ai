import React from 'react';
import { AbsoluteFill, Audio } from 'remotion';
import { styles } from './styles';
import { useTemplate028Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 028 - Comparison Table
 * Layout: Table with header row and data rows explaining differences
 */
const Template028 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const subtitle = elements.subtitle || '';
  const headers = elements.headers || [];
  const rows = elements.rows || elements.items || [];
  const note = elements.note || '';
  const bgColor = elements.backgroundColor || backgroundColors.navy;

  const anim = useTemplate028Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        {subtitle && <div style={{ ...styles.subtitle, ...anim.subStyle }}>{subtitle}</div>}
        <div style={styles.table}>
          {headers.length > 0 && (
            <div style={{ ...styles.row, ...styles.header }}>
              {headers.map((h, i) => <div key={i} style={styles.cell}>{h}</div>)}
            </div>
          )}
          {rows.map((row, ri) => (
            <div key={ri} style={{ ...styles.row, ...anim.getRowAnim(ri) }}>
              {row.cells.map((cell, ci) => (
                <div key={ci} style={{ ...styles.cell, ...(ci > 0 ? styles.cellAlt : {}) }}>{cell}</div>
              ))}
            </div>
          ))}
        </div>
        {note && <div style={styles.note}>{note}</div>}
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template028.displayName = 'Template028';
export default Template028;
