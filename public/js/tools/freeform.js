import $ from 'jquery';

export default function freeform(annDisplay, projShortname, username) {
    let tr; // the object that will go into the table
    let obj; // the object that will go into the database

    // configure table row
    if(annDisplay=="false") {
        tr = "<td contentEditable=true class='hidden'></td>";
    } else {
        tr = "<td contentEditable=true class='noEmpty'></td>";
    }

    // configure database object
    obj = {
        typeOfBinding:2,
        path: "files.list.#.mri.annotations."+projShortname+"."+annName,
        format: function(e, d) {
            const obj = d;
            $(e).html('<span>'+obj.data+'</span>');
        },
        parse: function(e, d) {
            var obj = d;
            obj.modified = (new Date()).toJSON();
            obj.modifiedBy = username;
            obj.data = $(e).text();
            return obj;
        }
    };

    return {tr, obj};
}