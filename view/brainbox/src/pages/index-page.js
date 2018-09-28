import $ from 'jquery'

import '../style/style.css'
import '../style/index-style.css'
import '../style/ui.css'

testWebSockets()
.then(function(m) {
    console.log("Connection to websockets is ok");
})
.catch(function(m) {
    alert(m);
});

// intro.js test
//startIntro();

$(".slide").height(window.innerHeight);
$(window).on('resize',function() {
    $(".slide").height(window.innerHeight);
    $("#neurons").css({width:window.innerWidth});
});

// go to url button
$("#go").click(goToURL);

// video settings
var vid = document.getElementById("neurons");
vid.playbackRate = 0.5;
vid.onloadedmetadata = function() {
    $("#neurons").css({width:window.innerWidth});
};

// List of brains
$("#list").change(function(e) {
    $("#url").val($("#list").val());
});

var menuShowing = true;
$(window).on('scroll',function() {
    var y = window.pageYOffset;
    if(y>100 && menuShowing) {
        $("#menu").css({top:-32, opacity:0});
        menuShowing = false;
        
        $("#footer").show();
    }
    if(y<100 && !menuShowing) {
        $("#menu").css({top:0, opacity:1});
        menuShowing = true;
    }
});

$("h2").css({marginLeft:0,opacity:1});

var version=1;
var brainsToTry=[
    "https://zenodo.org/record/44855/files/MRI-n4.nii.gz",
    "http://files.figshare.com/2284784/MRI_n4.nii.gz",
    "https://dl.dropbox.com/s/cny5b3so267bv94/p32-f18-uchar.nii.gz",
    "https://fcp-indi.s3.amazonaws.com/data/Projects/ABIDE_Initiative/RawData/NYU/0050952/session_1/anat_1/mprage.nii.gz"
]

// Present the history in localStorage if it exists.
    if(localStorage.AtlasMaker) {
        var stored=JSON.parse(localStorage.AtlasMaker);
        if(stored.version && stored.version==version) {
            var str = "<br/><p><b>Recently visited</b><br/>";
            for(var i=stored.history.length-1;i>=Math.max(0,stored.history.length-10);i--) {
                str += "<a href='"+location+"mri?url="+stored.history[i].url+"'>"+stored.history[i].url+"</a><br />";
                
                /**
                 * @todo Add image thumbnails
                 */
                /**/
                if(stored.history[i].img) {
                    $("#intro").append('<img src="'+stored.history[i].img+'"/>');
                }
                /**/
            }
            str += "</p>";
            $("#intro").append(str);
        } else {
            localStorage.clear();
        }
    }
    if(localStorage.AtlasMaker==undefined || stored.history.length<5) {
        var str="<br/><p><b>Some brains to try</b><br/>";
        for(var i=0;i<brainsToTry.length;i++) {
            str+="<a href='"+location+"mri?url="+brainsToTry[i]+"'>"+brainsToTry[i]+"</a><br />";
        }
        str+="</p>";
        $("#intro").append(str);
    }

// Add URL loading
    $("#url").keyup(function(e) {
        //console.log(e,e.target);
        if (e.keyCode == 13) {
            goToURL(e);
        }
    });

// Connect addProject button
    $("#addProject").click(function(){location="/project/new"});

function goToURL() {
    var url=$("#url").val();
    location="/mri?url="+url;
}
/**
 * @function testWebSockets
 */
function testWebSockets() {
    return new Promise(function(resolve, reject) {
        var host = "ws://ws.websocketstest.com:8080/service";
        var ws;

        if (window.WebSocket) {
            ws=new WebSocket(host);
        } else if (window.MozWebSocket) {
            ws=new MozWebSocket(host);
        } else {
            reject("BrainBox requires access to WebSockets, but this web browser does not support them. Try Firefox, Chrome or Safari.");
        }
        ws.onopen = function(e) {
            ws.close();
            resolve("Connection ok");
        };
        ws.onerror = function(e) {
            reject("BrainBox requires access to WebSockets, but your connection does not allow it. Ask your provider to allow WebSockets on port 8080");
        };
    });
}
