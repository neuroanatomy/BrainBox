/**
 * @function multiple
 * @desc Handles annotations restricted to a reduced number of options
 * @param {string} annotation Annotation
 * @param {string} path Path in object
 * @param {string} username Name of user annotating
 * @returns {object} Table object and database object
 */

export default function multiple(annotation, path, username) {
  let td = []; // the object that will go into the table
  const values = annotation.values.split(/;[ ]*/);

  // configure table row
  td.push("<td><select value=0><option value='' disabled selected hidden>Empty</option>");
  for (const o of values) {
    td.push(`<option value="${o}">${o}</option>`);
  }
  td.push("</select></td>");
  td = td.join("\n");

  // the object that will go into the database
  const obj = {
    typeOfBinding:2,
    path: path,
    format: function(e, d) {
      const obj2 = d;
      if (typeof obj2.data !== 'undefined') {
        // @todo Replace color assignment by the addition of a class
        e.get(0).querySelectorAll("select")[0].style.color = "#fff";
        e.get(0).querySelectorAll("select")[0].value = obj2.data;
      } else {
        e.get(0).querySelectorAll("select")[0].value = "";
      }
    },
    parse: function(e, d) {
      if (e.get(0).querySelectorAll("select")[0].value) {
        e.get(0).querySelectorAll("select")[0].style.color = "#fff";
      }
      const obj2 = d;
      obj2.modified = (new Date()).toJSON();
      obj2.modifiedBy = username;
      obj2.data = e.get(0).querySelectorAll("select")[0].value;

      return obj2;
    }
  };

  return {td, obj};
}


