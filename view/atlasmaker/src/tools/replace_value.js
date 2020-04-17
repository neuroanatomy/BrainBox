window.replace_value = () => {
    const me = AtlasMakerWidget;
    const {data,dim} = me.atlas;

    [oldValue,newValue]=prompt("Substitute oldValue->newValue").split("->").map((o)=>parseInt(o))

    console.time('replaceValue');
    const voxels = [];
    const d1d0 = dim[1]*dim[0];
    const d0 = dim[0];
    for(i=0;i<dim[0];i++) {
        for(j=0;j<dim[1];j++) {
            for(k=0;k<dim[2];k++) {
                const ind = k*d1d0 + j*d0 + i;
                if(data[ind] == oldValue) {
                    voxels.push([ind, newValue]);
                }
            }
        }
    }
    console.timeEnd('replaceValue');

    me.paintvol(voxels);
    me.sendAtlasDataMessage(data);
    me.drawImages();
};
