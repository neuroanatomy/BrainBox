/* global AtlasMakerWidget */
// eslint-disable-next-line camelcase
window.put_label = (cmd) => {
  if (cmd === 'help') { return '({vox: array}) Puts the label in the current volume'; }

  const me = AtlasMakerWidget;
  const {data} = me.atlas;
  const {vox} = cmd;

  console.time('put_label');
  me.paintvol(vox);
  console.timeEnd('put_label');

  me.sendAtlasDataMessage(data);
  me.drawImages();
};
