/* global Vue, projectInfo, projectShortname */

import '../style/style.css';
import '../style/ui.css';
import '../style/projectSettings-style.css';
import '../style/textAnnotations.css';
import '../style/access-style.css';
import '../style/dropdown-style.css';

import Config from './../../../../cfg.json';
import jdenticon from 'jdenticon';
import md5 from 'md5';

var app;
var cursorFiles = 0;

function appendFiles(list) {
  app.projectInfo.files.list.push(...list);
}
function queryFiles() {
  fetch(`/project/json/${app.projectInfo.shortname}/files?start=${cursorFiles}&length=100&name=true`)
    .then((res) => res.json())
    .then((list) => {
      if(list.length) {
        appendFiles(list);
        cursorFiles += 100;
        queryFiles();
      }
    });
}
function onAccessClicked( e, l ) {
  const al = e.target.closest("div").getAttribute("data-level");
  const parent = e.target.closest("div");
  parent.setAttribute("data-level", l+(al !== (l+1)));
  const newEvent = new Event('input', {bubbles: false, cancelable: true});
  parent.dispatchEvent(newEvent);
}
function onCheckClicked( e) {
  var checkbox = e.target.getAttribute("data-check");
  if( checkbox === "false" ) {
    e.target.setAttribute("data-check", "true" );
  } else {
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
  const rows = document.querySelectorAll("#importFilesDialog tbody tr");
  for(let row=0; row<rows.length; row++) {
    const tr = rows[row];
    const cols = tr.querySelectorAll("td");
    const url = cols[0].textContent;
    const name = cols[1].textContent;
    let found;

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
  }
  document.querySelector("#importFilesDialog").style.display = 'none';
}
function exportFiles() {
  var filename=prompt("File name", `${app.projectInfo.shortname}`);
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
function removeCollaborator() {
  var index=document.querySelector("table#access .selected").rowIndex - 1;
  app.projectInfo.collaborators.list.splice(index, 1);
}
function addAnnotation() {
  app.projectInfo.annotations.list.push({
    type: "volume",
    name: null,
    values: app.labelSets[0].source,
    display: "true"
  });
}
function removeAnnotation() {
  var index=document.querySelector("table#annotations .selected").rowIndex - 1;
  app.projectInfo.annotations.list.splice(index, 1);
}
function addFile() {
  app.projectInfo.files.list.push({source: null, name: null});
}
function removeFile() {
  var index=document.querySelector("table#files .selected").rowIndex - 1;
  app.projectInfo.files.list.splice(index, 1);
}
function importFiles() {
  const input = document.createElement('input');
  input.type="file";
  input.setAttribute('id', 'importFilesInput');
  input.style.display = 'none';
  document.querySelector("body").appendChild(input);
  input.onchange=function () {
    const [file]= this.files;
    const reader = new FileReader();
    reader.onload = function(e) {
      document.querySelector("body").removeChild(input);
      document.querySelector("#importFilesDialog").style.display = 'inline-block';
      const {result} = e.target;
      const lines = result.split("\n");
      const html = [];
      let cols;
      for(const line of lines) {
        cols=line.split(/[ ]*,[ ]*/);
        html.push("<tr><td contentEditable='true'>"+cols[0]+"</td><td>"+cols[1]+"</td></tr>");
      }
      document.querySelector("#importFilesDialog tbody").innerHTML += html.join("\n");
    };
    reader.readAsText(file);
  };
  input.click();
}
function saveChanges() {
  const xhr = new XMLHttpRequest();
  xhr.onload = function () {
    if (xhr.status >= 200 && xhr.status < 300) {
      const res = JSON.parse(xhr.responseText);
      if(res.success) {
        document.querySelector("#saveFeedback").textContent = "Successfully saved";
        setTimeout(function() {
          document.querySelector("#saveFeedback").textContent = "";
        }, 2000);
      }
    } else {
      document.querySelector("#saveFeedback").textContent = `Unable to save: ${xhr.responseText}`;
      setTimeout(function() {
        document.querySelector("#saveFeedback").textContent = "";
      }, 3000);
    }
  };
  const url = `/project/json/${app.projectInfo.shortname}`;
  xhr.open('POST', url);
  xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  xhr.send(`data=${JSON.stringify(app.projectInfo)}`);
}
function deleteProject() {
  const res = confirm(
    "Are you sure you want to delete project "
        + app.projectInfo.shortname + "? "
        + "This operation cannot be undone."
  );
  if (res !== true) {
    return;
  }
  const xhr = new XMLHttpRequest();
  xhr.onload = function () {
    if (xhr.status >= 200 && xhr.status < 300) {
      const resp = JSON.parse(xhr.responseText);
      if(resp.success) {
        document.querySelector("#saveFeedback").textContent = "Successfully deleted";
        setTimeout(function() {
          document.querySelector("#saveFeedback").textContent = "";
          location.assign("/");
        }, 2000);

        return;
      }
      document.querySelector("#saveFeedback").textContent = `Unable to delete project: ${resp.message}`;
      setTimeout(function() {
        document.querySelector("#saveFeedback").textContent = "";
      }, 3000);

      return;
    }

    document.querySelector("#saveFeedback").textContent = `Unable to delete project`;
    setTimeout(function() {
      document.querySelector("#saveFeedback").textContent = "";
    }, 3000);
  };
  xhr.open('DELETE', `/project/json/${app.projectInfo.shortname}`);
  xhr.send();
}
function updateName (ind, ev) {
  const userID = ev.target.value;
  fetch(`/user/json/${userID}`)
    .then((res) => res.json())
    .then((user) => {
      const {name} = user;
      app.projectInfo.collaborators.list[ind].name = name;
      app.projectInfo.collaborators.list[ind].userID = userID;
      app.$forceUpdate();
    });
}
function handleInput (ev, val, key) {
  val[key] = ev.target.innerText;
}
function handleAccess (ev, val, key) {
  const levelIndex = ev.target.dataset.level;
  const level = ["none", "view", "edit", "add", "remove"][levelIndex];
  val[key] = level;
}
function handleCheck (ev, val, key) {
  const {check} = ev.target.dataset;
  val[key] = check;
}
function mounted () {
  const url = Config.hostname + "/api/getLabelsets";
  fetch(url)
    .then((res) => res.json())
    .then((newLabels) => {
      for(const label of newLabels) {
        app.labelSets.push(label);
      }

      // Each project requires at least 1 volume-type annotation
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

    });

}

// Add avatar based on project's name
jdenticon.update(document.querySelector("svg"), md5(projectShortname));

app = new Vue({
  el: '#app',
  delimiters: ['[[', ']]'],
  data: {
    projectInfo: projectInfo,
    txt: "hello",
    annotationType: ['volume', 'text'],
    labelSets: []
  },
  methods: {
    updateName,
    handleInput,
    handleAccess,
    handleCheck
  },
  mounted
});

queryFiles();

// Add icon based on project's name
jdenticon.update(document.querySelector("svg"), md5(projectShortname));

// click event handler
document.addEventListener('click', function (e) {
  let preventDefault = true;

  // access widget
  if(e.target.matches('.view')) {
    onAccessClicked(e, 0);
  } else if(e.target.matches('.edit')) {
    onAccessClicked(e, 1);
  } else if(e.target.matches('.add')) {
    onAccessClicked(e, 2);
  } else if(e.target.matches('.remove')) {
    onAccessClicked(e, 3);
  } else

  // collaborators
  if(e.target.matches("#addCollaborator")) {
    addCollaborator(); // accParam
  } else if(e.target.matches("#removeCollaborator")) {
    removeCollaborator(); //accParam
  } else

  // annotations
  if(e.target.matches("#addAnnotation")) {
    addAnnotation(); // annParam
  } else if(e.target.matches("#removeAnnotation")) {
    removeAnnotation(); //annParam
  } else if(e.target.matches(".display")) { // for the display option
    onCheckClicked(e);
  } else

  /* files */
  if(e.target.matches("#addFile")) {
    addFile(); // filesParam
  } else if(e.target.matches("#removeFile")) {
    removeFile(); //filesParam
  } else if(e.target.matches("#importFiles")) {
    importFiles();
  } else if(e.target.matches("#exportFiles")) {
    exportFiles();
  } else

  /* import files dialog */
  if(e.target.matches("#importFilesDialogOk")) {
    importFilesDialog();
  } else if(e.target.matches("#importFilesDialogCancel")) {
    document.querySelector("#importFilesDialog").style.display = 'none';
  } else if(e.target.matches("#exportFiles")) {
    exportFiles();
  } else

  /* add project menu button */
  if(e.target.matches("#addProject")) {
    location.assign("/project/new");
  } else {
    preventDefault = false;
  }

  if(preventDefault) {
    e.preventDefault();
  }
});

document.querySelector("#access").addEventListener('click', function (ev) {
  selectRow(ev.target.closest('tr'));
  disableDeleteOnAnyoneUser(ev);
});
document.querySelector("#annotations").addEventListener('click', function (ev) {
  selectRow(ev.target.closest('tr'));
});
document.querySelector("#files").addEventListener('click', function (ev) {
  selectRow(ev.target.closest('tr'));
});

document.querySelector("#saveChanges").addEventListener('click', saveChanges);
document.querySelector("#deleteProject").addEventListener('click', deleteProject);
document.querySelector("#goToProject").addEventListener('click', function goToProject () {
  location.assign(`/project/${projectShortname}`);
});

// select first access row
document.querySelector("table#access tbody tr").classList.add("selected");
document.querySelector("table#access tbody tr input").setAttribute('disabled', true);
document.querySelector("#removeCollaborator").classList.add("disabled");

// select first annotations row
Vue.nextTick(() => {
  document.querySelector("table#annotations tbody tr").classList.add("selected");
});
