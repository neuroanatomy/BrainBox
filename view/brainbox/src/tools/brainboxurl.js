export default function brainboxurl(annotation, path, username) {
  let td; // the object that will go into the table
  let obj; // the object that will go into the database

  // configure table row
  td = "<td><a></a></td>";

  // configure database object
  obj = {
    typeOfBinding:1,
    path: path,
    format:function(e, d) {
      e.get(0).querySelectorAll("a")[0].href = location.origin + "/mri?url=" + d;
      e.get(0).querySelectorAll("a")[0].innerHTML = d.split("/").pop();
    }
  };

  return {td, obj};
}
