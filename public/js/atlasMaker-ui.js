/**
 * @page AtlasMaker: User Interface Elements
 */
var AtlasMakerUI = {
    /**
     * @function slider
     */
    slider: function slider(elem,callback) {
        var me=AtlasMakerWidget;
        var l=me.traceLog(slider,2);if(l)console.log(l);
    
        // Initialise a 'slider' control

        $(elem).data({
            drag:false,
            val:0,
            max:100
        });
    
        var movex=function(el,clientX) {
            if ($(el).data("drag")==true) {
                var R=$(el).find(".track")[0].getBoundingClientRect();
                var x=(clientX-R.left)/R.width;
                if(x<0) x=0;
                if(x>1) x=1;
                x=x*$(el).data("max");
                if(x!=$(el).data("val")) {
                    callback(x);
                }
            }
        };
        $(document).on("mousemove",function from_slider(ev){movex(elem,ev.clientX);});
        $(document).on("touchmove",function from_slider(ev){movex(elem,ev.originalEvent.changedTouches[0].pageX);});		
        $(document).on("mouseup touchend",function from_slider(){$(elem).data({drag:false})});
        $(elem).on('mousedown touchstart',function from_slider(){$(elem).data({drag:true})});
    },
    /**
     * @function chose
     */
    chose: function chose(elem,callback) {
        // Initialise a 'chose' control
        var ch=$(elem).find(".a");
        ch.each(function(c,d){
            $(d).click(function(){
                if($(this).hasClass("pressed")) {
                    callback($(this).attr('title'));
                    return;
                }
                ch.each(function(){$(this).removeClass("pressed")});
                $(this).addClass("pressed");
                if(callback)
                    callback($(this).attr('title'));
            });
        });
    },
    /**
     * @function toggle
     */
    toggle: function toggle(elem,callback) {
        // Initialise a 'toggle' control
        $(elem).click(function(){
            $(this).hasClass("pressed")?$(this).removeClass("pressed"):$(this).addClass("pressed");
            if(callback)
                callback($(this).hasClass("pressed"));
        });
    },
    /**
     * @function push
     */
    push: function push(elem,callback) {
        // Initialise a 'push' control
        $(elem).click(function(){
            if(callback)
                callback();
        });
    }
};