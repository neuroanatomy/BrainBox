/* global AtlasMakerWidget */
/* eslint-disable camelcase */
window.pen_value = (cmd) => {
  if(cmd === 'help') { return 'The numeric value of the current label'; }

  return AtlasMakerWidget.User.penValue;
};
