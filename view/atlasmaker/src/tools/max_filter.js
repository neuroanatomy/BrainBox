window.max_filter = (cmd) => {
    if(cmd === "help") { return "Replaces the label of each voxel by the most common neighbour"; }

    const me = AtlasMakerWidget;
    const {data,dim} = me.atlas;

    const c27=[];
    for(a=-1;a<=1;a++) {
        for(b=-1;b<=1;b++) {
            for(c=-1;c<=1;c++) {
                c27.push([a,b,c]);
            }
        }
    }

    console.time('max_filter');
    const voxels = [];
    const f = [];
    const d1d0 = dim[1]*dim[0];
    const d0 = dim[0];
    for(i=1;i<dim[0]-1;i++) {
        for(j=1;j<dim[1]-1;j++) {
            for(k=1;k<dim[2]-1;k++) {
                const ind = k*d1d0 + j*d0 + i;
                for(a=0;a<27;a++) {
                    const val = data[ind + (c27[a][0]*d1d0 + c27[a][1]*d0 + c27[a][2])];
                    f[val] = (f[val]|0) + 1;
                }
                let max = 0, imax;
                for(a in f) {
                    if(f[a]>max) {
                        max = f[a];
                        imax = a;
                    }
                }
                if(data[ind] != imax) {
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
