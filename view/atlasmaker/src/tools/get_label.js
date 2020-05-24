window.get_label = (cmd) => {
  if(cmd === "help") { return "({val: int}) Get a volume containing the given label value"; }

  const me = AtlasMakerWidget;
  const {data, dim} = me.atlas;
  const {val} = cmd;

  console.time('get_label');
  const voxels = [];
  const d1d0 = dim[1]*dim[0];
  const d0 = dim[0];
  for(i=0; i<dim[0]; i++) {
    for(j=0; j<dim[1]; j++) {
      for(k=0; k<dim[2]; k++) {
        const ind = k*d1d0 + j*d0 + i;
        if(data[ind] == val) {
          voxels.push([ind, val]);
        }
      }
    }
  }
  console.timeEnd('get_label');

  return voxels;
};
