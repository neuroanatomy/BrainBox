/**
 * @function hidden
 * @desc Handles hidden text annotations
 * @param {string} annotation Annotation
 * @param {string} path Path in object
 * @param {string} username Name of user annotating
 * @returns {object} Table object and database object
 */
export default function hidden(annotation, path, username) {
  // the object that will go into the table
  const td = '<td contentEditable=true class=\'hiddenText\'></td>';

  // the object that will go into the database
  const obj = {
    typeOfBinding:2,
    path: path,
    format: function(e, d) {
      if(typeof d.data === 'undefined') {
        e.innerHTML = '';
      } else {
        e.innerHTML = '<span>'+d.data+'</span>';
      }
    },
    parse: function(e, d) {
      const obj2 = d;
      obj2.modified = (new Date()).toJSON();
      obj2.modifiedBy = username;
      obj2.data = e.textContent;

      return obj2;
    }
  };

  return {td, obj};
}
