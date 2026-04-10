// eslint-disable-next-line no-unused-vars
export default function brainboxurl(annotation, path, username) {

  // configure table row
  const td = '<td><a></a></td>';

  // configure database object
  const obj = {
    typeOfBinding: 1,
    path: path,
    format: function (e, d) {
      const link = e.querySelector('a');
      link.href = location.origin + '/mri?url=' + d;
      link.innerHTML = d.split('/').pop();
    }
  };

  return { td, obj };
}
