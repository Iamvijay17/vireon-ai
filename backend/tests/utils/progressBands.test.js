const { PROGRESS_BANDS, mapToBand } = require('../../src/utils/progressBands');

describe('mapToBand', () => {
  it('maps 0 and 1 to the band edges', () => {
    expect(mapToBand([40, 49], 0)).toBe(40);
    expect(mapToBand([40, 49], 1)).toBe(49);
  });

  it('interpolates inside the band', () => {
    expect(mapToBand([80, 89], 0.5)).toBe(85); // round(4.5) = 5
    expect(mapToBand([40, 49], 1 / 3)).toBe(43);
  });

  it('clamps out-of-range and non-finite fractions', () => {
    expect(mapToBand([40, 49], -1)).toBe(40);
    expect(mapToBand([40, 49], 2)).toBe(49);
    expect(mapToBand([40, 49], NaN)).toBe(40);
  });

  it('keeps the existing job/course band values', () => {
    expect(PROGRESS_BANDS.job.render).toEqual([85, 94]);
    expect(PROGRESS_BANDS.course.render).toEqual([80, 89]);
  });
});
