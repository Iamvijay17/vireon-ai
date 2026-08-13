import React from 'react';
import { AbsoluteFill, Audio, Img } from 'remotion';
import { styles } from './styles';
import { useTemplate011Animations } from './animations';
import { backgroundColors } from '../../styles';
import { mergeStyle, positionStyle } from '../../theme';

/**
 * Template 011 - Team/Profiles
 * Layout: Profile cards with avatar, name, role, bio
 */
const Template011 = React.memo(({ scene }) => {
  const elements = scene?.elements || {};
  const title = elements.title || '';
  const explicitMembers = elements.members || elements.items;
  // Some generated scenes for this template arrive as a single flat
  // name/role/bio profile (not a `members` array) - fall back to treating
  // that as a one-member list instead of rendering nothing.
  const members = explicitMembers && explicitMembers.length
    ? explicitMembers
    : elements.name || elements.role || elements.bio
      ? [{ avatar: elements.image, name: elements.name, role: elements.role, bio: elements.bio }]
      : [];
  const bgColor = elements.backgroundColor || backgroundColors.navy;
  const overrides = elements.styleConfig || {};

  const anim = useTemplate011Animations({ frameOffset: 0 });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      <div style={{ ...styles.container, ...anim.bgStyle }}>
        {title && <h1 data-style-role="title" style={mergeStyle({ ...styles.title, ...anim.titleStyle, ...positionStyle(overrides.title?.position) }, overrides.title)}>{title}</h1>}
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
