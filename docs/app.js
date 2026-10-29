/**
 * @file docs/app.js
 * @description Snappy interactions for the paper-drift website.
 * Manages 1-click command copying and active code tab switching.
 * Part of paper-drift - https://github.com/Sooriya04/Paper-Drift
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Copy Hero CLI command
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

  // 2. Terminal Code Tabs
  const codeTabs = document.querySelectorAll('.code-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const terminalLang = document.getElementById('terminalLang');
  const terminalCopyBtn = document.getElementById('terminalCopyBtn');
  const terminalCopyLabel = document.getElementById('terminalCopyLabel');

  codeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      codeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const targetId = tab.dataset.tab;
      const lang = tab.dataset.lang || 'bash';
      if (terminalLang) terminalLang.textContent = lang;

      tabPanes.forEach(pane => {
        if (pane.id === targetId) {
          pane.classList.add('active');
        } else {
          pane.classList.remove('active');
        }
      });
    });
  });

  // 3. Terminal Snippet Copy Button
  if (terminalCopyBtn) {
    terminalCopyBtn.addEventListener('click', async () => {
      try {
        const activePane = document.querySelector('.tab-pane.active');
        if (!activePane) return;
        const codeElement = activePane.querySelector('code');
        const textToCopy = (codeElement ? codeElement.innerText : activePane.innerText).trim();

        await navigator.clipboard.writeText(textToCopy);

        if (terminalCopyLabel) terminalCopyLabel.textContent = 'Copied!';
        terminalCopyBtn.style.color = 'var(--emerald)';
        terminalCopyBtn.style.borderColor = 'var(--emerald-hairline)';

        setTimeout(() => {
          if (terminalCopyLabel) terminalCopyLabel.textContent = 'Copy';
          terminalCopyBtn.style.color = '';
          terminalCopyBtn.style.borderColor = '';
        }, 1600);
      } catch (err) {
        console.error('Terminal snippet copy failed:', err);
      }
    });
  }
});
