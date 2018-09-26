export default function freeform(annotation, path, username) {
    let tr; // the object that will go into the table
    let obj; // the object that will go into the database

    // configure table row
    tr = "<td contentEditable=true class='noEmpty'></td>";

    // configure database object
    obj = {
        typeOfBinding:2,
        path: path,
        format: function(e, d) {
            if(typeof d.data === 'undefined') {
                e.get(0).innerHTML = "";
            } else {
                e.get(0).innerHTML = '<span>'+d.data+'</span>';
            }
        },
        parse: function(e, d) {
            const obj = d;
            obj.modified = (new Date()).toJSON();
            obj.modifiedBy = username;
            obj.data = e.get(0).textContent;
            return obj;
        }
    };

    return {tr, obj};
}
