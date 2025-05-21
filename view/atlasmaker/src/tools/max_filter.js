/* global AtlasMakerWidget */
/* eslint-disable camelcase */
// eslint-disable-next-line max-statements
window.max_filter = (cmd) => {
  if (cmd === 'help') { return 'Replaces the label of each voxel by the most common neighbour'; }

  const me = AtlasMakerWidget;
  const {data, dim} = me.atlas;

  const c27 = [];
  for (let a = -1; a <= 1; a++) {
    for (let b = -1; b <= 1; b++) {
      for (let c = -1; c <= 1; c++) {
        c27.push([a, b, c]);
      }
    }
  }

  console.time('max_filter');
  const voxels = [];
  const f = [];
  const d1d0 = dim[1] * dim[0];
  const [d0] = dim;
  for (let i = 1; i < dim[0] - 1; i++) {
    for (let j = 1; j < dim[1] - 1; j++) {
      for (let k = 1; k < dim[2] - 1; k++) {
        const ind = k * d1d0 + j * d0 + i;
        for (let a = 0; a < 27; a++) {
          const val = data[ind + (c27[a][0] * d1d0 + c27[a][1] * d0 + c27[a][2])];
          f[val] = (f[val] | 0) + 1;
        }
        let imax,
          max = 0;
        for (const a in f) {
          // eslint-disable-next-line max-depth
          if (f[a] > max) {
            max = f[a];
            imax = a;
          }
        }
        if (data[ind] !== imax) {
          voxels.push([ind, imax]);
        }
        f.length = 0;
      }
    }
  }
  console.timeEnd('max_filter');

  me.paintvol(voxels);
  me.sendAtlasDataMessage(data);
  me.drawImages();
};
