export default function multiple(annotation, path, username) {
    let tr = []; // the object that will go into the table
    let obj; // the object that will go into the database
    const values = annotation.values.split(/[, ]+/);

    // configure table row
    tr.push("<td><select value=0><option value='' disabled selected hidden>Empty</option>");
    for (var o in values) {
        tr.push("<option value=\"" + values[o] + "\"" + ">" + values[o] + "</option>");
    }
    tr.push("</select></td>");
    tr = tr.join("\n");

    // configure database object
    obj = {
        typeOfBinding:2,
        path: path,
        format: function(e, d) {
            var obj = d;
            if (typeof obj.data !== 'undefined') {
                /**
                 * @todo Replace color assignment by the addition of a class
                 */
                e.get(0).querySelectorAll("select")[0].style.color = "#fff"; 
                e.get(0).querySelectorAll("select")[0].value = obj.data; 
            } else {
                e.get(0).querySelectorAll("select")[0].value = ""; 
            }
        },
        parse: function(e, d) {
            if (e.get(0).querySelectorAll("select")[0].value) {
                e.get(0).querySelectorAll("select")[0].style.color = "#fff";
            }
            const obj = d;
            obj.modified = (new Date()).toJSON();
            obj.modifiedBy = username;
            obj.data = e.get(0).querySelectorAll("select")[0].value;
            return obj;
        }
    };

    return {tr, obj};
}


