import $ from 'jquery'

import '../style/style.css';
import '../style/ui.css';
import '../style/projectNew-style.css';

var host = "ws://" + window.location.hostname + ":8080/";
let ws;
if (window.WebSocket) {
    ws = new WebSocket(host);
} else if (window.MozWebSocket) {
    ws = new MozWebSocket(host);
}
ws.onopen = function(msg) {
    ws.send(JSON.stringify({"type":"autocompleteClient"}));
}
ws.onmessage = function(message) {
    message = JSON.parse(message.data);
    if (message.type === "projectNameQuery") {
        if(message.metadata) {
            $("#warning").html("The project <a><strong>"+message.metadata.shortname+"</strong></a> already exists");
            $("#warning a").attr('href','/project/'+message.metadata.shortname);
            $("#warning").show();
            $("#createProject").css({'pointer-events':'none',opacity:0.5});
        } else {
            $("#warning").hide();
            $("#createProject").css({'pointer-events':'auto',opacity:1});
        }
    }
}

$("#projectName").on('keyup',function(e) {
    var name=DOMPurify.sanitize($("#projectName").val());
    
    // check if name is alphanumeric
    if(/[^a-zA-Z0-9]+/.test(name) === true) {
        $("#warning").html("The name <strong>"+name+"</strong> is not allowed. Project short names can only contain letters and numbers");
        $("#warning").show();
        $("#createProject").css({'pointer-events':'none',opacity:0.5});
    } else {
    // check if name already exists
        ws.send(JSON.stringify({"type":"projectNameQuery", "metadata":{"name":name}}));
    }
});

$("#createProject").click(function cancelChanges(){location.pathname='/project/'+$("#projectName").val()+'/settings'});
$("#cancelChanges").click(function cancelChanges(){location.pathname='{{{projectURL}}}'});

$("#addProject").click(function(){location="/project/new"});
