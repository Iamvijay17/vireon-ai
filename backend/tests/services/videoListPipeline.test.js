const { buildListPipeline } = require('../../src/services/video/videoService/crud');

describe('buildListPipeline', () => {
  const pipeline = buildListPipeline({ status: 'COMPLETED' }, 20, 10);

  it('filters, sorts newest first and paginates before trimming', () => {
    expect(pipeline[0]).toEqual({ $match: { status: 'COMPLETED' } });
    expect(pipeline[1]).toEqual({ $sort: { createdAt: -1 } });
    expect(pipeline[2]).toEqual({ $skip: 20 });
    expect(pipeline[3]).toEqual({ $limit: 10 });
  });

  it('drops statusHistory', () => {
    expect(pipeline[pipeline.length - 1]).toEqual({ $project: { statusHistory: 0 } });
  });

  it('keeps only sceneNumber and audio.file per scene, and omits script when absent', () => {
    const { script } = pipeline[4].$addFields;
    expect(script.$cond[2]).toBe('$$REMOVE');
    const scene = script.$cond[1].$mergeObjects[1].scenes.$map.in;
    expect(Object.keys(scene).sort()).toEqual(['audio', 'sceneNumber']);
    expect(scene.audio).toEqual({ file: '$$scene.audio.file' });
  });
});
