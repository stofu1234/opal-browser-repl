/**
 * DevTools initialization script for Chrome
 * Creates the Opal REPL panel in Chrome DevTools
 */

chrome.devtools.panels.create(
  'Opal REPL',
  'icons/opal-48.png',
  'panel/panel.html',
  (panel) => {
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
  }
);
