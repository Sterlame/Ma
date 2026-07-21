/* ===========================================================
   Ma — markdown live rendering
   Philosophy: what's stored is always plain markdown text.
   What's on screen is a styled view of that same text — the
   syntax characters stay visible (like iA Writer/Typora),
   just de-emphasized, so there's never a lossy conversion.

   Block-level styling (headings, quotes, lists) is applied as
   a CSS class on the line and is always safe to re-run.
   Inline styling (bold/italic/code) mutates the line's HTML,
   so it is only re-applied to lines the cursor is NOT
   currently inside, to avoid fighting the caret while typing.
   =========================================================== */

const MaMarkdown = (() => {

  function classForLine(text) {
    if (/^### /.test(text)) return 'h3';
    if (/^## /.test(text)) return 'h2';
    if (/^# /.test(text)) return 'h1';
    if (/^> /.test(text)) return 'quote';
    if (/^(-|\*) /.test(text)) return 'li';
    if (/^\d+\. /.test(text)) return 'li';
    return '';
  }

  function inlineHtml(text) {
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>**$1**</strong>');
    html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>*$1*</em>');
    return html;
  }

  // Ensure every top-level child of the editor is a div.line
  function normalize(editorEl) {
    if (editorEl.childNodes.length === 0) {
      const div = document.createElement('div');
      div.className = 'line';
      div.appendChild(document.createElement('br'));
      editorEl.appendChild(div);
      return;
    }
    Array.from(editorEl.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const div = document.createElement('div');
        div.className = 'line';
        div.textContent = node.textContent;
        editorEl.replaceChild(div, node);
      } else if (node.nodeName === 'BR' && node.parentNode === editorEl) {
        const div = document.createElement('div');
        div.className = 'line';
        div.appendChild(document.createElement('br'));
        node.replaceWith(div);
      } else if (node.nodeType === Node.ELEMENT_NODE && !node.classList.contains('line')) {
        node.classList.add('line');
      }
    });
  }

  function activeLine(editorEl) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    let node = sel.getRangeAt(0).startContainer;
    while (node && node.parentNode !== editorEl) node = node.parentNode;
    return node;
  }

  // Re-apply block class to every line; re-apply inline styling
  // only to lines the caret isn't currently in.
  function restyle(editorEl) {
    normalize(editorEl);
    const active = activeLine(editorEl);
    Array.from(editorEl.children).forEach((line) => {
      const text = line.textContent || '';
      const cls = classForLine(text);
      line.className = 'line' + (cls ? ' ' + cls : '');
      line.classList.toggle('active-block', line === active);
      if (line !== active) {
        const rendered = inlineHtml(text) || '<br>';
        if (line.innerHTML !== rendered) line.innerHTML = rendered;
      }
    });
  }

  function toMarkdown(editorEl) {
    return Array.from(editorEl.children)
      .map((line) => line.textContent || '')
      .join('\n');
  }

  function fromMarkdown(editorEl, markdown) {
    editorEl.innerHTML = '';
    const lines = (markdown || '').split('\n');
    lines.forEach((text) => {
      const div = document.createElement('div');
      div.className = 'line';
      div.textContent = text;
      editorEl.appendChild(div);
    });
    if (lines.length === 0) {
      const div = document.createElement('div');
      div.className = 'line';
      div.appendChild(document.createElement('br'));
      editorEl.appendChild(div);
    }
    restyle(editorEl);
  }

  function wordCount(markdown) {
    const stripped = (markdown || '')
      .replace(/^#{1,3}\s+/gm, '')
      .replace(/[*_`>]/g, '')
      .trim();
    if (!stripped) return 0;
    return stripped.split(/\s+/).filter(Boolean).length;
  }

  return { restyle, toMarkdown, fromMarkdown, wordCount };
})();
