window.replace_value = (cmd) => {
  if(cmd === "help") { return "({src: int, dst: int}) Replaces label src by label dst"; }

  const me = AtlasMakerWidget;
  const {data, dim} = me.atlas;
  const {src, dst} = cmd;

  console.time('replace_value');
  const voxels = [];
  const d1d0 = dim[1]*dim[0];
  const d0 = dim[0];
  for(i=0; i<dim[0]; i++) {
    for(j=0; j<dim[1]; j++) {
      for(k=0; k<dim[2]; k++) {
        const ind = k*d1d0 + j*d0 + i;
        if(data[ind] == src) {
          voxels.push([ind, dst]);
        }
      }
    }
  }
  console.timeEnd('replace_value');

  me.paintvol(voxels);
  me.sendAtlasDataMessage(data);
  me.drawImages();
};
