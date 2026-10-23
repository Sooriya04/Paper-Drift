/**
 * @file website/app.js
 * @description Snappy interactions for the paper-drift developer website.
 * Manages 1-click command copying and quickstart code tab switching.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Copy command button
  const copyBtn = document.getElementById('copyBtn');
  const copyLabel = document.getElementById('copyLabel');
  const cliCommand = document.getElementById('cliCommand');

  if (copyBtn && cliCommand) {
    copyBtn.addEventListener('click', async () => {
      try {
        const textToCopy = cliCommand.textContent.trim();
        await navigator.clipboard.writeText(textToCopy);

        if (copyLabel) copyLabel.textContent = 'Copied!';
        copyBtn.style.color = 'var(--emerald)';
        copyBtn.style.borderColor = 'var(--emerald-hairline)';

        setTimeout(() => {
          if (copyLabel) copyLabel.textContent = 'Copy';
          copyBtn.style.color = '';
          copyBtn.style.borderColor = '';
        }, 1600);
      } catch (err) {
        console.error('Clipboard copy failed:', err);
      }
    });
  }

  // 2. Quickstart code tabs
  const codeTabs = document.querySelectorAll('.code-tab');
  const tabPanes = {
    'tab-cli': document.getElementById('tab-cli'),
    'tab-node': document.getElementById('tab-node'),
    'tab-agent': document.getElementById('tab-agent')
  };

  codeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      codeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetId = tab.dataset.tab;
      Object.entries(tabPanes).forEach(([id, pane]) => {
        if (pane) {
          if (id === targetId) {
            pane.classList.add('active');
          } else {
            pane.classList.remove('active');
          }
        }
      });
    });
  });
});
