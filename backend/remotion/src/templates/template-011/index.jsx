import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate011Animations } from './animations';
import { backgroundColors } from '../../styles';

/**
 * Template 011 - Team/Profiles
 * Layout: Profile cards with avatar, name, role, bio
 */
const Template011 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const members = elements.members || elements.items || [];
  const bgColor = elements.backgroundColor || backgroundColors.navy;

  const anim = useTemplate011Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 style={{ ...styles.title, ...anim.titleStyle }}>{title}</h1>}
        <div style={styles.cardRow}>
          {members.map((member, index) => (
            <div key={index} style={{ ...styles.profileCard, ...anim.getCardAnim(index) }}>
              {member.avatar && <Img src={member.avatar} style={styles.avatar} />}
              <div style={styles.name}>{member.name}</div>
              <div style={styles.role}>{member.role}</div>
              {member.bio && <div style={styles.bio}>{member.bio}</div>}
            </div>
          ))}
        </div>
      </div>
      {scene?.audio?.file && <Audio src={scene.audio.file} />}
    </AbsoluteFill>
  );
});

Template011.displayName = 'Template011';
export default Template011;
