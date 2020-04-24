import jdenticon from 'jdenticon'
import md5 from 'md5'

import '../style/style.css';
import '../style/ui.css';
import '../style/projectSettings-style.css';
import '../style/textAnnotations.css';
import '../style/access-style.css';
import '../style/dropdown-style.css';

import Config from './../../../../cfg.json';

// Add avatar based on project's name
jdenticon.update(document.querySelector("svg"),md5(projectShortname));

var app = new Vue({
  el: '#app',
  delimiters: ['[[', ']]'],
  data: {
    projectInfo: projectInfo,
    annotationType: ['volume', 'text'],
    labelSets: []
  },
  methods: {
      updateName: function (ind, e) {
          const userID = e.target.value;
          fetch(`/user/json/${userID}`)
            .then((res) => {return res.json()})
            .then((user) => {
                const {name, nickname: userID} = user;
                app.projectInfo.collaborators.list[ind].name = name;              
                app.projectInfo.collaborators.list[ind].userID = userID;              
                this.$forceUpdate();
                });
      },
      handleInput: function (e, val, key) {
        const sel = document.getSelection();
        const offset = sel.anchorOffset;
        val[key] = e.target.textContent;
        app.$nextTick(() => {
            sel.collapse(sel.anchorNode, offset);
        });
      },
      handleAccess: function (e, val, key) {
          const levelIndex = e.target.dataset.level;
          const level = ["none","view","edit","add","remove"][levelIndex];
          val[key] = level;
      },
      handleCheck: function (e, val, key) {
        const check = e.target.dataset.check;
        val[key] = check;
    }
},
  mounted: function () {
    const url = Config.hostname + "/api/getLabelsets";
    fetch(url)
    .then((res) => {
        return res.json();
    })
    .then((newLabels) => {
        for(const label of newLabels) {
            app.labelSets.push(label);
        }
    });
  }
});

// Add icon based on project's name
jdenticon.update(document.querySelector("svg"),md5(projectShortname));

// Each project requires at least 1 vectorial-type annotation
// Add a default one if there is none.
let vecAnnFound = false;
for(const ann of app.projectInfo.annotations.list) {
    if(ann.type === "volume") {
        vecAnnFound = true;
        break;
    }
}
if(vecAnnFound === false) {
    addAnnotation();
}

var cursorFiles = 0;
queryFiles();

function queryFiles() {
    fetch(`/project/json/${app.projectInfo.shortname}/files?start=${cursorFiles}&length=100&name=true`)
    .then((res) => {return res.json()})
    .then((list) => {
        if(list.length) {
            appendFiles(list);
            cursorFiles += 100;
            queryFiles();
        }
    });
}

function appendFiles(list) {
    app.projectInfo.files.list.push.apply(app.projectInfo.files.list, list);
}

// click event handler
document.addEventListener('click', function (e) {
    /* access widget */
    if(e.target.matches('.view')) {
        e.preventDefault();
        onAccessClicked(e,0);
    } else if(e.target.matches('.edit')) {
        e.preventDefault();
        onAccessClicked(e,1);
    } else if(e.target.matches('.add')) {
        e.preventDefault();
        onAccessClicked(e,2);
    } else if(e.target.matches('.remove')) {
        e.preventDefault();
        onAccessClicked(e,3);
    } else
    
    /* collaborators */
    if(e.target.matches("#addCollaborator")) {
        e.preventDefault();
        addCollaborator(); // accParam
    } else if(e.target.matches("#removeCollaborator")) {
        e.preventDefault();
        removeCollaborator(); //accParam
    } else

    /* annotations */
    if(e.target.matches("#addAnnotation")) {
        e.preventDefault();
        addAnnotation(); // annParam
    } else if(e.target.matches("#removeAnnotation")) {
        e.preventDefault();
        removeAnnotation(); //annParam
    } else if(e.target.matches(".display")) { // for the display option
        e.preventDefault();
        onCheckClicked(e);
    } else

    /* files */
    if(e.target.matches("#addFile")) {
        e.preventDefault();
        addFile(); // filesParam
    } else if(e.target.matches("#removeFile")) {
        e.preventDefault();
        removeFile(); //filesParam
    } else if(e.target.matches("#importFiles")) {
        e.preventDefault();
        importFiles();
    } else if(e.target.matches("#exportFiles")) {
        e.preventDefault();
        exportFiles();
    } else

    /* import files dialog */
    if(e.target.matches("#importFilesDialogOk")) {
        e.preventDefault();
        importFilesDialog();
    } else if(e.target.matches("#importFilesDialogCancel")) {
        e.preventDefault();
        document.querySelector("#importFilesDialog").style.display = 'none';
    } else if(e.target.matches("#exportFiles")) {
        e.preventDefault();
        exportFiles();
    } else
    
    /* add project menu button */
    if(e.target.matches("#addProject")) {
        location="/project/new";
    }
});

document.querySelector("#access").addEventListener('click', function (e) {
    selectRow(e.target.closest('tr'));
    disableDeleteOnAnyoneUser(e);
});
document.querySelector("#annotations").addEventListener('click', function (e) {
    selectRow(e.target.closest('tr'));
});
document.querySelector("#files").addEventListener('click', function (e) {
    selectRow(e.target.closest('tr'));
});

document.querySelector("#saveChanges").addEventListener('click', saveChanges);
document.querySelector("#deleteProject").addEventListener('click', deleteProject);
document.querySelector("#goToProject").addEventListener('click', function goToProject () {
    location.href=`/project/${projectShortname}`;
});

// select first access row
document.querySelector("table#access tbody tr").classList.add("selected");
document.querySelector("table#access tbody tr input").setAttribute('disabled', true)
document.querySelector("#removeCollaborator").classList.add("disabled");

// select first annotations row
Vue.nextTick(() => {
    document.querySelector("table#annotations tbody tr").classList.add("selected");
});

// select first data files row
// document.querySelector("table#files tbody tr").classList.add("selected");

/**
 * @function onAccessClicked
 * @desc Handles click on one of the 5 access levels: 0=none, 1=view, 2=edit, 3=add, 4=remove
 * @param {Event} e Event triggered by the click
 * @param {int} l Base level of the access icon clicked
 */

 /**
 * @todo This function does not update the projectInfo object!!
 */
function onAccessClicked( e, l ) {
    // access level
    const al = e.target.closest("div").getAttribute("data-level");
    const parent = e.target.closest("div");
    parent.setAttribute("data-level", l+(al != (l+1)));
    const newEvent = new Event('input', {bubbles: false, cancelable: true});
    parent.dispatchEvent(newEvent);
}

/** 
 * @function onCheckClicked
 * @desc Handles click on 'display' option for annotations in the project settings; 0=do not display; 1=display
 * @param {Event} e Event triggered by click
 */
function onCheckClicked( e, l ) {
    // checkbox toggle for 'display' option
    var checkbox = e.target.getAttribute("data-check");
    if( checkbox == "false" ) {
        e.target.setAttribute("data-check", "true" );
    }
    else {
        e.target.setAttribute("data-check", "false" );
    }
    const newEvent = new Event('input', {bubbles: false, cancelable: true});
    e.target.dispatchEvent(newEvent);
}

function selectRow(tr) {
    for(const row of tr.closest("tbody").rows) {
        row.classList.remove("selected");
    }
    tr.classList.add("selected");
}
function disableDeleteOnAnyoneUser(e) {
    const curTable = e.currentTarget.getAttribute("id");

    // check if the selected row belongs to the #access table
    if(curTable === "access") {
        // check if the selected user is 'anyone'
        const rowIndex = e.currentTarget.querySelector("tr.selected").rowIndex - 1;
        if(app.projectInfo.collaborators.list[rowIndex].userID === 'anyone') {
            // if yes, disable the 'remove' button
            document.querySelector("#removeCollaborator").classList.add('disabled');
        } else {
            document.querySelector("#removeCollaborator").classList.remove('disabled');
        }
    }
}

function importFilesDialog() {
    var sum=0;
    var rows = document.querySelectorAll("#importFilesDialog tbody tr");
    for(let row=0;row<rows.length;row++) {
        const tr = rows[row];
        const cols = tr.querySelectorAll("td");
        const url = cols[0].textContent;
        const name = cols[1].textContent;
        let i, found;

        if(url.length<10) {
            console.log("Too short to be an url:", url);
            continue;
        }
        
        // look if the data file is not already in the list
        found=false;
        for(const file of app.projectInfo.files.list) {
            if(file.source === url) {
                if(file.name === "") {
                    file.name=name;
                }
                found=true;
                break;
            }
        }
        if(found === false) {
            app.projectInfo.files.list.push({source:url, name:name});
        }
    };
    document.querySelector("#importFilesDialog").style.display = 'none';
    console.log(sum,"files added");
}

function exportFiles() {
    var filename=prompt("File name",`${app.projectInfo.shortname}`);
    if(filename === null) {
        return;
    }

    const csv = app.projectInfo.files.list.map((o) => `${o.source},${o.name}`).join("\n");
    var csvData = 'data:text/ascii;charset=utf-8,'+encodeURIComponent(csv);
    var a = document.createElement('a');
    a.href = csvData;
    a.download = filename+'.csv';
    document.body.appendChild(a);
    a.click();
}

function addCollaborator() {
    app.projectInfo.collaborators.list.push({
        userID: "",
        access: {
            collaborators:"view",
            annotations:"view",
            files:"view"
        }
    });
}
function removeCollaborator(param) {
    var index=document.querySelector("table#access .selected").rowIndex - 1;
    app.projectInfo.collaborators.list.splice(index, 1);
}
function addAnnotation() {
    app.projectInfo.annotations.list.push({
        type: "vectorial",
        values: app.labelSets[0], // .source,
        display: "true"
    });
}
function removeAnnotation(param) {
    var index=document.querySelector("table#annotations .selected").rowIndex - 1;
    app.projectInfo.annotations.list.splice(index, 1);
}
function addFile() {
    app.projectInfo.files.list.push({source:'', name:''});
}
function removeFile(param) {
    var index=document.querySelector("table#files .selected").rowIndex - 1;
    app.projectInfo.files.list.splice(index, 1);
}
function importFiles() {
    // var input=document.getElementById("i-open-mesh");
    console.log("importing files...");
    const input = document.createElement('input');
    input.type="file";
    input.setAttribute('id', 'importFilesInput');
    input.style.display = 'none';
    document.querySelector("body").appendChild(input);
    input.onchange=function (e) {
        var file=this.files[0];
        var reader = new FileReader();
        reader.onload = function(e) {
            document.querySelector("body").removeChild(input);
            document.querySelector("#importFilesDialog").style.display = 'inline-block';
            var result=e.target.result;
            var lines=result.split("\n");
            var html=[];
            let cols;
            for(const line of lines) {
                cols=line.split(/[ ]*,[ ]*/);
                html.push("<tr><td contentEditable='true'>"+cols[0]+"</td><td>"+cols[1]+"</td></tr>");
            }
            document.querySelector("#importFilesDialog tbody").innerHTML += html.join("\n");
        }
        reader.readAsText(file);
    }
    input.click();
}

function saveChanges() {
    var xhr = new XMLHttpRequest();
    xhr.onload = function () {
        console.log("Loaded", xhr.status);
        if (xhr.status >= 200 && xhr.status < 300) {
            const res = JSON.parse(xhr.responseText);
            console.log(xhr.responseText);
            if(res.success) {
                document.querySelector("#saveFeedback").textContent = "Successfully saved";
                setTimeout(function() {
                    document.querySelector("#saveFeedback").textContent = "";
                },2000);
            }
        } else {
            document.querySelector("#saveFeedback").textContent = "Unable to save. Please try again later";
            setTimeout(function() {
                document.querySelector("#saveFeedback").textContent = "";
            },3000);
        }
    };
    console.log("saveChanges:", app.projectInfo.files.list);
    const url = `/project/json/${app.projectInfo.shortname}`;
    console.log("saveChanges URL:", url);
    xhr.open('POST', url);
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.send(`data=${JSON.stringify(app.projectInfo)}`);
}
function deleteProject() {
    var res = confirm(
        "Are you sure you want to delete project "
        + app.projectInfo.shortname + "? "
        + "This operation cannot be undone."
    );
    
    if (res !== true) {
        return;
    }

    const msg = "";
    const xhr = new XMLHttpRequest();
    xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
            const res = JSON.parse(xhr.responseText);
            if(res.success) {
                document.querySelector("#saveFeedback").textContent = "Successfully deleted";
                setTimeout(function() {
                    document.querySelector("#saveFeedback").textContent = "";
                    location="/";
                },2000);
                return;
            } else {
                document.querySelector("#saveFeedback").textContent = `Unable to delete project: ${res.message}`;
                setTimeout(function() {
                    document.querySelector("#saveFeedback").textContent = "";
                }, 3000);
                return;
            }
        }

        document.querySelector("#saveFeedback").textContent = `Unable to delete project`;
        setTimeout(function() {
            document.querySelector("#saveFeedback").textContent = "";
        }, 3000);
    };
    xhr.open('DELETE', `/project/json/${app.projectInfo.shortname}`);
    xhr.send();
}
