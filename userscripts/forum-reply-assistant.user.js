// ==UserScript==
// @name         Forum Reply Assistant
// @namespace    https://github.com/admin05/AutoReply
// @version      1.0.2
// @description  Press Cmd+R/Ctrl+R to extract the current forum topic and draft a reply into the focused editor.
// @author       Codex
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/admin05/AutoReply/main/userscripts/forum-reply-assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/admin05/AutoReply/main/userscripts/forum-reply-assistant.user.js
// ==/UserScript==

(function () {
  'use strict';

  const SHORTCUT_KEY = 'r';
  const MAX_SOURCE_CHARS = 8000;

  const FORUM_SELECTORS = [
    'article',
    'main',
    '[role="main"]',
    '.post',
    '.postbody',
    '.post-content',
    '.thread',
    '.thread-content',
    '.topic',
    '.topic-content',
    '.message',
    '.messageContent',
    '.content',
    '#content',
  ];

  const EDITOR_SELECTOR = [
    'textarea',
    'input[type="text"]',
    'input:not([type])',
    '[contenteditable="true"]',
    '[contenteditable="plaintext-only"]',
    '[role="textbox"]',
  ].join(',');

  function normalizeText(text) {
    return String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\t ]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function getTitle() {
    const titleCandidates = [
      document.querySelector('h1')?.innerText,
      document.querySelector('[property="og:title"]')?.getAttribute('content'),
      document.querySelector('title')?.textContent,
      document.title,
    ];

    return normalizeText(titleCandidates.find(Boolean) || '这个主题')
      .replace(/[-_|].*$/, '')
      .slice(0, 80);
  }

  function scoreContentNode(node) {
    const text = normalizeText(node.innerText || node.textContent || '');
    if (text.length < 80) return 0;

    const paragraphCount = node.querySelectorAll('p, li, blockquote').length;
    const editorPenalty = node.querySelector(EDITOR_SELECTOR) ? 0.45 : 1;
    const navPenalty = node.matches('nav, header, footer, aside') ? 0.2 : 1;

    return text.length * editorPenalty * navPenalty + paragraphCount * 180;
  }

  function getMainContent() {
    const nodes = FORUM_SELECTORS.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
    const candidates = nodes.length ? nodes : [document.body];
    const best = candidates
      .map((node) => ({ node, score: scoreContentNode(node) }))
      .sort((a, b) => b.score - a.score)[0]?.node || document.body;

    return normalizeText(best.innerText || best.textContent || '').slice(0, MAX_SOURCE_CHARS);
  }

  function buildReply({ title, content }) {
    const source = `${title}\n${content}`;
    const congratulationsWords = ['恭喜', '中奖', '上岸', '通过', '录取', '成功', '喜提', '拿下', '达成'];
    const thanksWords = ['教程', '经验', '分享', '整理', '攻略', '方法', '总结', '资料', '测评'];

    if (congratulationsWords.some((word) => source.includes(word))) {
      return '恭喜恭喜，真不错！';
    }

    if (thanksWords.some((word) => source.includes(word))) {
      return '感谢分享，整理得很有用！';
    }

    return '写得不错，支持一下！';
  }

  function getActiveEditor() {
    const active = document.activeElement;
    if (active?.matches?.(EDITOR_SELECTOR)) return active;

    const selection = window.getSelection();
    const anchor = selection?.anchorNode;
    const selectedElement = anchor?.nodeType === Node.ELEMENT_NODE ? anchor : anchor?.parentElement;
    const selectedEditor = selectedElement?.closest?.(EDITOR_SELECTOR);
    if (selectedEditor) return selectedEditor;

    return null;
  }

  function insertTextIntoEditor(editor, text) {
    editor.focus();

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      const start = editor.selectionStart ?? editor.value.length;
      const end = editor.selectionEnd ?? editor.value.length;
      const before = editor.value.slice(0, start);
      const after = editor.value.slice(end);
      editor.value = `${before}${text}${after}`;
      const cursor = start + text.length;
      editor.setSelectionRange(cursor, cursor);
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    if (editor.isContentEditable || editor.getAttribute('role') === 'textbox') {
      const selection = window.getSelection();
      if (selection?.rangeCount) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const fragment = document.createDocumentFragment();
        text.split('\n').forEach((line, index) => {
          if (index > 0) fragment.appendChild(document.createElement('br'));
          fragment.appendChild(document.createTextNode(line));
        });
        range.insertNode(fragment);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        text.split('\n').forEach((line, index) => {
          if (index > 0) editor.appendChild(document.createElement('br'));
          editor.appendChild(document.createTextNode(line));
        });
      }
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      return true;
    }

    return false;
  }

  function showToast(message, isError = false) {
    const existing = document.getElementById('forum-reply-assistant-toast');
    existing?.remove();

    const toast = document.createElement('div');
    toast.id = 'forum-reply-assistant-toast';
    toast.textContent = message;
    Object.assign(toast.style, {
      position: 'fixed',
      zIndex: '2147483647',
      right: '18px',
      bottom: '18px',
      maxWidth: '360px',
      padding: '10px 12px',
      borderRadius: '8px',
      background: isError ? '#7f1d1d' : '#1f2937',
      color: '#fff',
      font: '13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      boxShadow: '0 10px 30px rgba(0,0,0,.22)',
    });

    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2600);
  }

  function handleShortcut(event) {
    const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === SHORTCUT_KEY;
    if (!isShortcut || event.altKey || event.shiftKey) return;

    const editor = getActiveEditor();
    if (!editor) {
      event.preventDefault();
      event.stopPropagation();
      showToast('请先把光标放到回帖输入框里，再按 Cmd+R / Ctrl+R。', true);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const reply = buildReply({ title: getTitle(), content: getMainContent() });
    const inserted = insertTextIntoEditor(editor, reply);
    showToast(inserted ? '已生成回帖草稿并填入当前输入框。' : '没有识别到可写入的输入框。', !inserted);
  }

  window.addEventListener('keydown', handleShortcut, true);
})();
