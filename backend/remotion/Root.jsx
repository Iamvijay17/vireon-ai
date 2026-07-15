import React from 'react';
import { Composition } from 'remotion';
import { VideoComposition } from './VideoComposition';
import fs from 'fs';
import path from 'path';

// This file is used by Remotion to discover compositions
// The actual assets are passed via --props when rendering

export const Root = () => {
  return (
    <>
      <Composition
        id="VideoComposition"
        component={VideoComposition}
        durationInFrames={100}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          assets: {
            title: '',
            description: '',
            scenes: [],
          },
        }}
      />
    </>
  );
};