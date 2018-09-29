/* global AtlasMakerWidget */
/*! AtlasMaker: Interaction */
import * as pako from '../../downloads/pako.min.js';
import $ from 'jquery';

/**
 * @page AtlasMaker: Interaction
 */
export var AtlasMakerInteraction = {
    //========================================================================================
    // Local user interaction
    //========================================================================================
    /**
     * @function changeToolbarDisplay
     * @desc Changes the way in which the toolbar is displayed
     * @param {string} display Position where the toolbar is displayed
     * @returns {void}
     */
    changeToolbarDisplay: function changeToolbarDisplay(display) {
        switch(display) {
            case "minimize":
                $("#tools-maximized").hide();
                $("#tools-minimized").show();
                break;
            case "maximize":
                $("#tools-maximized").show();
                $("#tools-minimized").hide();
                break;
            case "left":
                $("body").attr("data-toolbarDisplay", "left");
                break;
            case "right":
                $("body").attr("data-toolbarDisplay", "right");
                break;
        }
    },

    /**
     * @function changeView
     * @param {string} theView The view plane to use.
     * @returns {void}
     */
    changeView: function changeView(theView) {
        var me = AtlasMakerWidget;
        switch(theView) {
            case 'sag':
                me.User.view = 'sag';
                break;
            case 'cor':
                me.User.view = 'cor';
                break;
            case 'axi':
                me.User.view = 'axi';
                break;
        }
        me.sendUserDataMessage(JSON.stringify({ 'view':me.User.view }));
        me.configureBrainImage();
        me.configureAtlasImage();
        me.resizeWindow();
        me.drawImages();
        me.initCursor();
    },

    /**
     * @function changeTool
     * @desc Change the tool that defines the effect of mouse clicks
     * @param { string } theTool Name of the tool: Paint, Erase, Measure, Adjust
     * @returns {void}
     */
    changeTool: function changeTool(theTool) {
        var me = AtlasMakerWidget;
        if(theTool.toLowerCase() === me.User.tool) {
            return;
        }

        switch(theTool) {
            case 'Show':
                me.User.tool = 'show';
                break;
            case 'Paint':
                me.User.tool = 'paint';
                break;
            case 'Erase':
                me.User.tool = 'erase';
                break;
            case 'Measure':
                me.User.tool = 'measure';
                break;
            case 'Adjust':
                me.User.tool = 'adjust';
                if($("#adjust").length === 0) {
                    me.container.find("#resizable").append(me.html.adjust);
                }
                break;
            case 'Eyedrop':
                me.User.tool = 'eyedrop';
                break;
        }
        me.sendUserDataMessage(JSON.stringify({ 'tool':me.User.tool }));
        me.User.measureLength = null;
    },

    /**
     * @function changePenSize
     * @param {number} theSize Size of the pen
     * @returns {void}
     */
    changePenSize: function changePenSize(theSize) {
        var me = AtlasMakerWidget;
        me.User.penSize = parseInt(theSize);
        me.sendUserDataMessage(JSON.stringify({ 'penSize':me.User.penSize }));
    },

    /**
     * @function changePenColor
     * @param {number} index Index of the color to use for the pen
     * @returns {void}
     */
    changePenColor: function changePenColor(index) {
        var me = AtlasMakerWidget;
        var c = me.ontology.labels[index].color;
        $("#color").css({ backgroundColor:'rgb(' + c[0] + ', ' + c[1] + ', ' + c[2] + ')' });
        me.User.penValue = me.ontology.labels[index].value;
        me.sendUserDataMessage(JSON.stringify({ 'penValue':me.User.penValue }));
    },

    /**
     * @function changeSlice
     * @param {number} x New slice number
     * @returns {void}
     */
    changeSlice: function changeSlice(x) {
        var me = AtlasMakerWidget;
        me.User.slice = x;
        me.sendUserDataMessage(JSON.stringify({ 'slice':me.User.slice }));
        me.drawImages();
    },

    /**
     * @function prevSlice
     * @returns {void}
     */
    prevSlice: function prevSlice() {
        var me = AtlasMakerWidget;
        var x = $("#slice").data("val")-1;
        if(x<0) { x = 0; }
        x = Math.round(x);
        if(x !== $("#slice").data("val")) {
            $("#slice").data("val", x);
            me.changeSlice(x);
        }
    },

    /**
     * @function nextSlice
     * @returns {void}
     */
    nextSlice: function nextSlice() {
        var me = AtlasMakerWidget;
        var max = $("#slice").data("max");
        var x = $("#slice").data("val") + 1;
        if(x>max) { x = max; }
        x = Math.round(x);
        if(x !== $("#slice").data("val")) {
            $("#slice").data("val", x);
            me.changeSlice(x);
        }
    },

    /**
     * @function toggleFill
     * @param {bool} doFill Whether to fill or not
     * @returns {void}
     */
    toggleFill: function toggleFill(doFill) {
        var me = AtlasMakerWidget;
        me.User.doFill = doFill;
        me.sendUserDataMessage(JSON.stringify({ 'doFill':me.User.doFill }));
    },

    /**
     * @function toggleChat
     * @returns {void}
     */
    toggleChat: function toggleChat() {
        $("#chatBlock").toggle();
    },

    /**
     * @function toggleFullscreen
     * @returns {void}
     */
    toggleFullscreen: function toggleFullscreen() {
        var me = AtlasMakerWidget;
        if(me.fullscreen === false) {
            // Enter fullscreen
            //-----------------

            // add black overlay
            var black = $("<div id = 'blackOverlay'>");
            black.css({ position:'fixed', top:0, left:0, width:'100%', height:'100%', 'z-index':5, 'background-color':'#222' });
            $('body').append(black);

            // configure display mode
            $("body").addClass('atlasMaker-fullscreen');
            $("#atlasMaker")
              .detach()
              .appendTo('body');
            me.resizeWindow();

            // configure toolbar for edit mode
            me.fullscreen = true;
        } else {

            // Exit fullscreen
            //----------------

            // remove black overlay
            $("#blackOverlay").remove();

            // go back to display mode
            $("body").removeClass('atlasMaker-fullscreen');
            $("#atlasMaker").detach()
.appendTo('#stereotaxic');
            me.resizeWindow();
            me.fullscreen = false;
        }
    },

    /**
     * @function render3D
     * @returns {void}
     */
    render3D: function render3D() {
        var me = AtlasMakerWidget;
        // puts a fresh version of the segmentation in localStorage
        localStorage.brainbox = URL.createObjectURL(new Blob([me.encodeNifti()]));

        // opens 3d render window
        window.open(me.hostname + "/surface.html?path = " + me.User.dirname + me.User.atlasFilename, "_blank");
    },

    /**
     * @function link
     * @returns {void}
     */
    link: function link() {
        window.prompt("Copy to clipboard:", location.href + "&view = " + AtlasMakerWidget.User.view + "&slice = " + AtlasMakerWidget.User.slice);
    },

    /**
     * @function upload
     * @returns {void}
     */
    upload: function upload() {
        var me = AtlasMakerWidget;
        var inp = $("<input>");
        inp.hide();
        $("body").append(inp);
        var input = inp.get(0);
        input.type = "file";
        input.onchange = function () {
            var name = this.files[0];
            var reader = new FileReader();
            reader.onload = function (e) {
                var result = e.target.result;
                var nii;
                if(name.name.split('.').pop() === "gz") {
                    var inflate = new pako.Inflate();
                    inflate.push(new Uint8Array(result), true);
                    nii = inflate.result.buffer;
                } else { nii = result; }
                var mri = me.loadNifti(nii);

                if( mri.dim[0] !== me.User.dim[0] ||
                    mri.dim[1] !== me.User.dim[1] ||
                    mri.dim[2] !== me.User.dim[2]) {
                    console.log("ERROR: Volume dimensions do not match");

                    return;
                }

                // copy uploaded data to atlas data
                var i;
                for(i = 0; i<me.atlas.data.length; i++) { me.atlas.data[i] = mri.data[i]; }

                // send uploaded data to server (compressed)
                me.socket.binaryType = "arraybuffer";
                me.socket.send(pako.deflate(mri.data));
                me.socket.binaryType = "blob";

                // redraw images
                me.drawImages();
            };
            reader.readAsArrayBuffer(name);
            inp.remove();
        };
        input.click();
    },

    /**
     * @function download
     * @returns {void}
     */
    download: function download() {
        var me = AtlasMakerWidget;
        var a = document.createElement('a');
        var niigz = me.encodeNifti();
        var niigzBlob = new Blob([niigz]);
        a.href = window.URL.createObjectURL(niigzBlob);
        a.download = me.atlasName + ".nii.gz";
        document.body.appendChild(a);
        a.click();
    },

    /**
     * @function color
     * @returns {void}
     */
    color: function color() {
        var me = AtlasMakerWidget;
        $("#labelset").appendTo(me.container);
        $("#labelset").show();

        var obj = $("#labelset");
        $(obj)
          .find("span#labels-name")
          .text(me.ontology.name);
        $(obj)
          .find("#label-list")
          .html("");
        for(var i = 0; i<me.ontology.labels.length; i++) {
            var l = me.ontology.labels[i];
            var la = $(obj)
              .find("#label-template")
              .clone();
            la.attr({ "data-index":i });
            la.find(".label-color").css({ backgroundColor:"rgb(" + l.color[0] + ", " + l.color[1] + ", " + l.color[2] + ")" });
            la.find(".label-name").text(l.name);
            la.click(function() {
                me.changePenColor($(this).attr("data-index"));
                $(obj).hide();
            });
            $(obj)
              .find("#label-list")
              .append(la);
            la.show();
        }
    },

    /**
     * @function ontologyValueToColor
     * @param {number} val Numerical value used for painting with the selected label
     * @returns {array} Red, green and blue colors
     */
    ontologyValueToColor: function ontologyValueToColor(val) {
        var me = AtlasMakerWidget;
        var c = [0, 0, 0];
        var i;
        if(val in me.ontology.valueToIndex) { i = me.ontology.valueToIndex[val]; }
        if(i !== undefined) {
            c = me.ontology.labels[i].color;
        } else if(val) {
            c = [255, 0, 0]; // unavailable labels are set to pure red
        }

        return c;
    },

    /**
     * @function eyedrop
     * @param {number} x X or horizontal coordinate
     * @param {number} y Y or vertical coordinate
     * @param {object} usr User structure for the current user
     * @returns {number} The value at the given location
     */
    eyedrop : function eyedrop( x, y, usr) {
        var me = AtlasMakerWidget;
        var z = usr.slice;
        var i = me.slice2index( x, y, z, usr.view );

        return me.atlas.data[i];
    },

    /**
     * @function togglePreciseCursor
     * @returns {void}
     */
    togglePreciseCursor: function togglePreciseCursor() {
        var me = AtlasMakerWidget;
        me.flagUsePreciseCursor = !me.flagUsePreciseCursor;
        me.initCursor();
    },

    /**
     * @function initCursor
     * @returns {void}
     */
    initCursor: function initCursor() {
        var me = AtlasMakerWidget;
        var W = parseFloat($('#atlasMaker canvas').css('width'));
        var H = parseFloat($('#atlasMaker canvas').css('height'));
        var w = parseFloat($('#atlasMaker canvas').attr('width'));
        var h = parseFloat($('#atlasMaker canvas').attr('height'));

        me.Crsr.x = parseInt(w/2);
        me.Crsr.y = parseInt(h/2);

        me.Crsr.fx = parseInt(w/2)*(W/w);
        me.Crsr.fy = parseInt(h/2)*(H/h);
        $("#cursor").css({ left:(me.Crsr.x*(W/w)) + "px", top:(me.Crsr.y*(H/h)) + "px", width:me.User.penSize*(W/w), height:me.User.penSize*(H/h) });

        if(me.flagUsePreciseCursor) {
            if($("#finger").length === 0) {
                me.container.append("<div id = 'finger'></div>");
                $("#finger").addClass("touchDevice");

                // configure touch events for tablets
                $("#finger").on("touchstart", function(e) { me.touchstart(e); });
                $("#finger").on("touchend", function(e) { me.touchend(e); });
                $("#finger").on("touchmove", function(e) { me.touchmove(e); });

                // turn off eventual touch events handled by canvas
                me.canvas.ontouchstart = null;
                me.canvas.ontouchmove = null;
                me.canvas.ontouchend = null;
            }
            me.updateCursor();

            $("#finger").css({ left:me.Crsr.fx + "px", top:me.Crsr.fy + "px" });
        } else {
            // remove precise cursor
            $("#finger").remove();

            // configure touch events for tablets
            me.canvas.ontouchstart = me.touchstart;
            me.canvas.ontouchmove = me.touchmove;
            me.canvas.ontouchend = me.touchend;
        }
    },

    /**
     * @function updateCursor
     * @returns {void}
     */
    updateCursor: function updateCursor() {
        var me = AtlasMakerWidget;
        $("#finger").removeClass("move draw configure");
        switch(me.Crsr.state) {
            case "move": $("#finger").addClass("move"); break;
            case "draw": $("#finger").addClass("draw"); break;
            case "configure": $("#finger").addClass("configure"); break;
        }
    },

    /**
     * @function mousedown
     * @param {object} e Event object
     * @returns {void}
     */
    mousedown: function mousedown(e) {
        var me = AtlasMakerWidget;
        e.preventDefault();

        var W = parseFloat($('#atlasMaker canvas').css('width'));
        var H = parseFloat($('#atlasMaker canvas').css('height'));
        var w = parseFloat($('#atlasMaker canvas').attr('width'));
        var h = parseFloat($('#atlasMaker canvas').attr('height'));
        var o = $('#atlasMaker canvas').offset();
        var x = parseInt((e.pageX-o.left)*(w/W));
        // i have to add here the compensation for rectangular pixels: f(brain_Wdim, brain_Hdim)
        var y = parseInt((e.pageY-o.top)*(h/H));
        me.down(x, Math.round(y*me.brain_Wdim/me.brain_Hdim));
    },

    /**
     * @function mousemove
     * @desc Handles a mouse move event. The x and y slice screens are computed from the pageX and pageY screen coordinates and dispatched to the generic move handler. The position and size of the cursor are adjusted.
     * @param {object} e Event object
     * @returns {void}
     */
    mousemove: function mousemove(e) {
        var me = AtlasMakerWidget;
        e.preventDefault();
        var W = parseFloat($('#atlasMaker canvas').css('width'));
        var H = parseFloat($('#atlasMaker canvas').css('height'));
        var w = parseFloat($('#atlasMaker canvas').attr('width'));
        var h = parseFloat($('#atlasMaker canvas').attr('height'));
        var o = $('#atlasMaker canvas').offset();
        var x = parseInt((e.pageX-o.left)*(w/W));
        var y = parseInt((e.pageY-o.top)*(h/H));

        $("#cursor").css({
            left:(x*(W/w)) + 'px',
            top:(y*(H/h)) + 'px',
            width:me.User.penSize*(W/w),
            height:me.User.penSize*(H/h)
        });
        me.move(x, Math.round(y*me.brain_Wdim/me.brain_Hdim));
    },

    /**
     * @function mouseup
     * @param {object} e Event object
     * @returns {void}
     */
    mouseup: function mouseup(e) {
        var me = AtlasMakerWidget;
        me.up(e);
    },

    /**
     * @function touchstart
     * @param {object} e Event object
     * @returns {void}
     */
    touchstart: function touchstart(e) {
        var me = AtlasMakerWidget;
        e.preventDefault();

        var W = parseFloat($('#atlasMaker canvas').css('width'));
        var H = parseFloat($('#atlasMaker canvas').css('height'));
        var w = parseFloat($('#atlasMaker canvas').attr('width'));
        var h = parseFloat($('#atlasMaker canvas').attr('height'));
        var o = $('#atlasMaker canvas').offset();
        var touchEvent;
        if(e.originalEvent) { touchEvent = e.originalEvent.changedTouches[0]; } else { touchEvent = e.changedTouches[0]; }
        var x = parseInt((touchEvent.pageX-o.left)*(w/W));
        var y = parseInt((touchEvent.pageY-o.top)*(h/H));

        if(me.flagUsePreciseCursor) {
            // Precision cursor
            me.Crsr.x0 = x;
            me.Crsr.cachedX = x;
            me.Crsr.y0 = y;
            me.Crsr.cachedY = y;
            me.Crsr.fx = $("#finger").offset().left;
            me.Crsr.fy = $("#finger").offset().top;
            me.Crsr.touchStarted = true;
            setTimeout(function() {
                if( me.Crsr.cachedX === me.Crsr.x0 && me.Crsr.cachedY === me.Crsr.y0 && !me.Crsr.touchStarted) {
                    // short tap: change mode
                    me.Crsr.state = (me.Crsr.state === "move")?"draw":"move";
                    me.updateCursor();
                }
            }, 200);
            setTimeout(function() {
                if (me.Crsr.cachedX === me.Crsr.x0 && me.Crsr.cachedY === me.Crsr.y0 && me.Crsr.touchStarted) {
                    // long tap: change to configure mode
                    me.Crsr.prevState = me.Crsr.state;
                    me.Crsr.state = "configure";
                    me.updateCursor();
                }
            }, 1000);
            me.down(me.Crsr.x, Math.round(me.Crsr.y*me.brain_Wdim/me.brain_Hdim));
        } else { me.down(x, Math.round(y*me.brain_Wdim/me.brain_Hdim)); }
    },

    /**
     * @function touchmove
     * @param {object} e Event object
     * @returns {void}
     */
    touchmove: function touchmove(e) {
        var me = AtlasMakerWidget;
        if(me.Crsr.touchStarted === false && me.debug) {
            console.log("WARNING: touch can move without having started");
        }

        e.preventDefault();

        var W = parseFloat($('#atlasMaker canvas').css('width'));
        var H = parseFloat($('#atlasMaker canvas').css('height'));
        var w = parseFloat($('#atlasMaker canvas').attr('width'));
        var h = parseFloat($('#atlasMaker canvas').attr('height'));
        var o = $('#atlasMaker canvas').offset();
        var touchEvent;
        if(e.originalEvent) { touchEvent = e.originalEvent.changedTouches[0]; } else { touchEvent = e.changedTouches[0]; }
        var x = parseInt((touchEvent.pageX-o.left)*(w/W));
        var y = parseInt((touchEvent.pageY-o.top)*(h/H));

        if(me.flagUsePreciseCursor) {
            // Precision cursor
            var dx = x-me.Crsr.x0;
            var dy = y-me.Crsr.y0;
            if(me.Crsr.state === "move"||me.Crsr.state === "draw") {
                me.Crsr.x += dx;
                me.Crsr.y += dy;
                $("#cursor").css({ left:me.Crsr.x*(W/w), top:me.Crsr.y*(H/h), width:me.User.penSize*(W/w), height:me.User.penSize*(H/h) });
                if(me.Crsr.state === "draw") { me.move(me.Crsr.x, Math.round(me.Crsr.y*me.brain_Wdim/me.brain_Hdim)); }
            }
            me.Crsr.fx += dx*(W/w);
            me.Crsr.fy += dy*(H/h);
            $("#finger").offset({ left:me.Crsr.fx, top:me.Crsr.fy });

            me.Crsr.x0 = x;
            me.Crsr.y0 = y;
        } else {
            $("#cursor").css({
                left:(x*(W/w)) + 'px',
                top:(y*(H/h)) + 'px',
                width:me.User.penSize*(W/w),
                height:me.User.penSize*(H/h)
            });
            me.move(x, Math.round(y*me.brain_Wdim/me.brain_Hdim));
        }
    },

    /**
     * @function touchend
     * @param {object} e Event object
     * @returns {void}
     */
    touchend: function touchend(e) {
        var me = AtlasMakerWidget;
        e.preventDefault();

        if(me.flagUsePreciseCursor) {
            // Precision cursor
            me.Crsr.touchStarted = false;
            if(me.Crsr.state === "configure") {
                me.Crsr.state = me.Crsr.prevState;
                me.updateCursor();
            }
        }
        me.up(e);
    },

    /**
     * @function down
     * @desc Generic pointer down event: Deals with down events generated by mouse clicks or touch events. The effect of the down event is determined by the current User.tool
     * @param { integer } x X coordinate in slice space
     * @param { integer } y Y coordinate in slice space
     * @returns {void}
     */
    down: function down(x, y) {
        var me = AtlasMakerWidget;

        switch(me.User.tool) {
            case 'show':
                me.User.mouseIsDown = true;
                me.sendUserDataMessage(JSON.stringify({ 'mouseIsDown':true }));
                me.showxy(-1, 'm', x, y, me.User);
                break;
            case 'paint':
                if(me.editMode === 0) {
                // check for 'edit' access
                    return;
                }
                if(me.User.doFill) {
                // fill
                    me.paintxy(-1, 'f', x, y, me.User);
                } else {
                //paint
                    me.User.mouseIsDown = true;
                    me.sendUserDataMessage(JSON.stringify({ 'mouseIsDown':true }));
                    me.paintxy(-1, 'mf', x, y, me.User);
                }
                break;
            case 'erase':
                if(me.editMode === 0) {
                // check for 'edit' access
                    return;
                }
                if(me.User.doFill) {
                // fill
                    me.paintxy(-1, 'e', x, y, me.User);
                } else {
                // erase
                    me.User.mouseIsDown = true;
                    me.sendUserDataMessage(JSON.stringify({ 'mouseIsDown':true }));
                    me.paintxy(-1, 'me', x, y, me.User);
                }
                break;
            case 'measure':
                if(me.User.measureLength === null) {
                    me.User.measureLength = [{ x:x, y:y }];
                } else {
                    me.User.measureLength.push({ x:x, y:y });
                }
                break;
            case 'adjust':
                me.User.mouseIsDown = true;
                me.info.x = x/me.brain_W;
                me.info.y = 1-y/me.brain_H;
                break;
            case 'eyedrop':
                var value = me.eyedrop( x, y, me.User );
                if (!value) { break; }
                var index = me.ontology.valueToIndex[value];
                var selRegionName = me.ontology.labels[index].name;
                me.info.region = selRegionName;
                me.changePenColor( index );
                break;
        }

        // init annotation length counter
        me.annotationLength = 0;
    },

    /**
     * @function move
     * @desc Generic pointer move event: Deals with move events generated by mouse clicks or touch events. The effect of the move event is determined by the current User.tool
     * @param {number} x X coordinate in slice space
     * @param {number} y Y coordinate in slice space
     * @returns {void}
     */
    move: function move(x, y) {
        var me = AtlasMakerWidget;
        if(!me.User.mouseIsDown) { return; }

        switch(me.User.tool) {
            case 'show':
                me.showxy(-1, 'm', x, y, me.User);
                break;
            case 'paint':
                me.paintxy(-1, 'lf', x, y, me.User);
                break;
            case 'erase':
                me.paintxy(-1, 'le', x, y, me.User);
                break;
            case 'adjust':
                me.info.x = x/me.brain_W;
                me.info.y = 1-y/me.brain_H;
                me.drawImages();
                break;
        }
    },

    /**
     * @function up
     * @desc Generic pointer up event: Deals with up events generated by mouse clicks or touch events.
     * @param {object} e Event object
     * @returns {void}
     */
    up: function up(e) {
        var me = AtlasMakerWidget;

        // Send mouse up (touch ended) message
        me.User.mouseIsDown = false;
        me.User.x0 = -1;

        me.sendUserDataMessage(JSON.stringify({ 'mouseIsDown':false }));

        var msg;

        switch(me.User.tool) {
            case 'show':
                msg = { "c":"u" };
                me.sendShowMessage(msg);
                break;
            case 'paint':
            case 'erase':
                msg = { c:"mu" };
                me.sendPaintMessage(msg);

                // add annotated length to User.annotation length and post to DB
                me.logToDatabase("annotationLength", {
                    source:me.User.source,
                    atlas:me.User.atlasFilename,
                    length:me.annotationLength
                })
                .then(function(response) {
                    var length = parseInt(response.length);
                    me.info.length = length + " mm";
                    me.displayInformation();
                });

                me.annotationLength = 0;

                // compute total segmented volume
                var vol = me.computeSegmentedVolume();
                me.info.volume = parseInt(vol) + " mm3";
                break;
            case 'eyedrop':
                me.displayInformation();

                msg = { "c":"mu" };
                me.sendPaintMessage(msg);
                break;
            default:
                msg = { "c":"mu" };
                me.sendPaintMessage(msg);
        }

        /*
            TEST
        */
        //me.sendRequestSliceMessage();
    },

    /**
     * @function keyDown
     * @param {object} e Event object
     * @returns {void}
     */
    keyDown: function keyDown(e) {
        var me = AtlasMakerWidget;
        // console.log("key:", e.which);

        if(e.which === 13 && $(e.target).attr('contenteditable')) {
            e.preventDefault();

            return;
        }

        if(e.target.tagName !== "BODY") { return; }

        switch(e.which) {
            case 13: // return
                if(me.User.measureLength) {
                    var length = 0;
                    var p = me.User.measureLength;
                    var wdim = me.brain_Wdim;
                    var hdim = me.brain_Hdim;
                    var i;
                    for(i = 1; i<p.length; i++) { length += Math.sqrt(Math.pow(wdim*(p[i].x-p[i-1].x), 2) + Math.pow(hdim*(p[i].y-p[i-1].y), 2)); }
                    $("#log").append("Length: " + length + "<br/>");
                    me.User.measureLength = null;
                }
                break;
            case 37: // left arrow
                me.prevSlice();
                e.preventDefault();
                break;
            case 39: // right arrow
                me.nextSlice(this);
                e.preventDefault();
                break;
        }
    },

    /**
     * @function onkey
     * @param {object} e Event object
     * @returns {void}
     */
    onkey: function onkey(e) {
        var me = AtlasMakerWidget;
        if (e.keyCode === 13) {
            me.sendChatMessage();
        }
    }
};
