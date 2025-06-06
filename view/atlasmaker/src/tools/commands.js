window.commands = (cmd) => {
  if (cmd === 'help') { return 'List all available commands'; }

  fetch('/lib/atlasmaker-tools/tools.json')
    .then((r) => r.text())
    .then((t) => JSON.parse(t))
    .then((f) => f.filter((o) => o.type === 'cmd'))
    .then((f) => f.map((o) => o.name).join('\n'))
    .then((t) => console.log(t));
};
