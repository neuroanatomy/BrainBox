/*global AtlasMakerWidget $*/
/*! AtlasMaker: Image Drawing */

/**
 * @page AtlasMaker: Image Drawing
 * @returns object
 */

export var AtlasMakerDraw = {

    /**
     * @function resizeWindow
     * @returns {void}
     */
    resizeWindow: function resizeWindow() {
        const me = AtlasMakerWidget;
        const wH = me.container.height();
        const wW = me.container.width();
        const wAspect = wW/wH;
        const bAspect = me.brain_W*me.brain_Wdim/(me.brain_H*me.brain_Hdim);

        if(wAspect>bAspect) {
            $('#resizable').css({ width:(100*bAspect/wAspect) + '%', height:'100%' });
        } else {
            $('#resizable').css({ width:'100%', height:(100*wAspect/bAspect) + '%' });
        }
    },

    /**
     * @function configureBrainImage
     * @returns {void}
     */
    configureBrainImage: function configureBrainImage() {
        var me = AtlasMakerWidget;
        if(me.User.view === null) { me.User.view = "sag"; }

        const {s2v} = me.User;
        switch(me.User.view) {
            case 'sag': [me.brain_W, me.brain_H, me.brain_D, me.brain_Wdim, me.brain_Hdim] = [s2v.sdim[1], s2v.sdim[2], s2v.sdim[0], s2v.wpixdim[1], s2v.wpixdim[2]]; break; // sagital
            case 'cor': [me.brain_W, me.brain_H, me.brain_D, me.brain_Wdim, me.brain_Hdim] = [s2v.sdim[0], s2v.sdim[2], s2v.sdim[1], s2v.wpixdim[0], s2v.wpixdim[2]]; break; // coronal
            case 'axi': [me.brain_W, me.brain_H, me.brain_D, me.brain_Wdim, me.brain_Hdim] = [s2v.sdim[0], s2v.sdim[1], s2v.sdim[2], s2v.wpixdim[0], s2v.wpixdim[1]]; break; // axial
        }

        me.canvas.width = me.brain_W;
        me.canvas.height = me.brain_H*me.brain_Hdim/me.brain_Wdim;
        me.brain_offcn.width = me.brain_W;
        me.brain_offcn.height = me.brain_H;
        me.brain_px = me.brain_offtx.getImageData(0, 0, me.brain_offcn.width, me.brain_offcn.height);

        if(me.User.slice === null || me.User.slice >= me.brain_D-1) { me.User.slice = parseInt(me.brain_D/2); }

        me.sendUserDataMessage(JSON.stringify({ 'view':me.User.view, 'slice':me.User.slice }));

        // configure toolbar slider
        $(".slider#slice").data({ max:me.brain_D-1, val:me.User.slice });

        // if($("#slice .thumb")[0]) { $("#slice .thumb")[0].style.left = (me.User.slice/(me.brain_D-1)*100) + "%"; }
        $("#slice").trigger("updateDisplay");

        me.drawImages();
        me.initCursor();
    },

    /**
     * @function configureAtlasImage
     * @returns {void}
     */
    configureAtlasImage: function configureAtlasImage() {
        var me = AtlasMakerWidget;
        // has to be run *after* configureBrainImage
        me.atlas_offcn.width = me.brain_W;
        me.atlas_offcn.height = me.brain_H;
        me.atlas_px = me.atlas_offtx.getImageData(0, 0, me.atlas_offcn.width, me.atlas_offcn.height);
    },

    /**
     * @function nearestNeighbour
     * @param {object} ctx Drawing context
     * @returns {void}
     */
    nearestNeighbour: function nearestNeighbour(ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.mozImageSmoothingEnabled = false;
    },

    /**
     * @function computeSegmentedVolume
     * @returns {number} Volume in voxel units
     */
    computeSegmentedVolume: function computeSegmentedVolume() {
        var me = AtlasMakerWidget;
        let i;
        let sum = 0;
        const {data, dim} = me.atlas;

        for(i = 0; i<dim[0]*dim[1]*dim[2]; i++) {
            if(data[i]>0) { sum++; }
        }

        return sum*me.User.pixdim[0]*me.User.pixdim[1]*me.User.pixdim[2];
    },

    /**
     * @function displayInformation
     * @desc Overlays text and vectorial information on top of the annotation volume slice. Text information is added from the AtlasMakerWidget.info object. Vectorial information is displayed using svg format
     * @returns {void}
     */
    displayInformation: function displayInformation() {
        var me = AtlasMakerWidget;
        var text = me.container.find("#text-layer");
        var vector = me.container.find("#vector-layer");
        let i = 0;
        let k, str;

        me.info.slice = me.User.slice;

        str = "";
        for(k in me.info) {
            if (Object.prototype.hasOwnProperty.call(me.info, k)) {
                str += "<span>" + k + ": " + me.info[k] + "</span><br/>";
            }
        }
        text.html(str);

        str = "";
        if(me.User.measureLength) {
            var W = parseFloat($('#atlasmaker canvas').css('width'));
            var w = parseFloat($('#atlasmaker canvas').attr('width'));
            var zx = W/w;
            var zy = zx*me.brain_Hdim/me.brain_Wdim;
            var p = me.User.measureLength;
            var str1 = "M" + zx*p[0].x + ", " + zy*p[0].y;
            for(i = 1; i<p.length; i++) {
                str1 += "L" + zx*p[i].x + ", " + zy*p[i].y;
            }
            str += [
                "<circle fill='#00ff00' cx=" + zx*p[0].x + " cy=" + zy*p[0].y + " r=3 />",
                "<path stroke='#00ff00' fill='none' d='" + str1 + "'/>",
                (i>0)?"<circle fill='#00ff00' cx=" + zx*p[i-1].x + " cy=" + zy*p[i-1].y + " r=3 />":""
            ].join("\n");
        }
        vector.html(str);
    },

    /**
     * @function drawImages
     * @returns {void}
     */
    drawImages: function drawImages() {
        var me = AtlasMakerWidget;
        if(me.brain_img.img
           && me.flagLoadingImg.view
           && me.flagLoadingImg.slice) {
            me.context.clearRect(0, 0, me.context.canvas.width, me.canvas.height);
            me.displayInformation();

            me.nearestNeighbour(me.context);

            me.context.drawImage(me.brain_img.img, 0, 0, me.brain_W, me.brain_H*me.brain_Hdim/me.brain_Wdim);
            me.drawAtlasImage(me.flagLoadingImg.view, me.flagLoadingImg.slice);
        }

        if(!me.brain_img.img || me.brain_img.view !== me.User.view || me.brain_img.slice !== me.User.slice) {
            me.sendRequestSliceMessage();
        }
    },

    /**
     * @function drawAtlasImage
     * @param {string} view View string: 'sag', 'cor', or 'axi'
     * @param {number} slice The slice number
     * @returns {void}
     */
    drawAtlasImage: function drawAtlasImage(view, slice) {
        var me = AtlasMakerWidget;
        if(!me.atlas) { return; }
        const {data} = me.atlas;
        let i, s, x, y;
        const [ys, yc, ya] = [slice, slice, slice];
        for(y = 0; y < me.brain_H; y++) {
            for(x = 0; x < me.brain_W; x++) {
                switch(view) {
                    case 'sag': s = [ys, x, me.brain_H-1-y]; break;
                    case 'cor': s = [x, yc, me.brain_H-1-y]; break;
                    case 'axi': s = [x, me.brain_H-1-y, ya]; break;
                }
                i = me.S2I(s, me.User);
                var c = me.ontologyValueToColor(data[i]);
                var alpha = (data[i]>0)?255:0;
                i = (y*me.atlas_offcn.width + x)*4;
                me.atlas_px.data[i] = c[0];
                me.atlas_px.data[i + 1] = c[1];
                me.atlas_px.data[i + 2] = c[2];
                me.atlas_px.data[i + 3] = alpha*me.alphaLevel;
            }
        }
        me.atlas_offtx.putImageData(me.atlas_px, 0, 0);
        me.nearestNeighbour(me.context);
        me.context.drawImage(me.atlas_offcn, 0, 0, me.brain_W, me.brain_H*me.brain_Hdim/me.brain_Wdim);
    }
};
