/**
 * DevTools initialization script for Firefox
 * Creates the Opal REPL panel in Firefox DevTools
 */

browser.devtools.panels.create(
  'Opal REPL',
  'icons/opal-48.png',
  'panel/panel.html'
).then((panel) => {
  console.log('Opal REPL panel created');

  // Panel show/hide events
  panel.onShown.addListener((panelWindow) => {
    // Panel is now visible - focus input
    if (panelWindow.repl && panelWindow.repl.repl) {
      panelWindow.repl.repl.focus();
    }
  });

  panel.onHidden.addListener(() => {
    // Panel is now hidden
  });
});
