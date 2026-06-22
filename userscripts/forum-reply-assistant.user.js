// ==UserScript==
// @name         Forum Reply Assistant
// @namespace    https://github.com/cen/AutoReply
// @version      1.0.0
// @description  Press Cmd+R/Ctrl+R to extract the current forum topic and draft a reply into the focused editor.
// @author       Codex
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SHORTCUT_KEY = 'r';
  const MAX_SOURCE_CHARS = 8000;
  const MAX_POINTS = 3;

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

  function getSentences(text) {
    return normalizeText(text)
      .replace(/([。！？!?；;])/g, '$1\n')
      .split(/\n+/)
      .map((line) => normalizeText(line))
      .filter((line) => line.length >= 12 && line.length <= 180)
      .filter((line) => !/^(回复|引用|登录|注册|收藏|举报|分享|发表于|只看该作者)/.test(line));
  }

  function extractKeywords(text) {
    const stopWords = new Set([
      '这个', '一个', '我们', '你们', '他们', '可以', '没有', '不是', '还是', '但是', '因为',
      '所以', '如果', '然后', '已经', '现在', '自己', '感觉', '问题', '内容', '主题', '论坛',
      '回复', '楼主', '大家', '一下', '什么', '怎么', '这些', '那些', '以及', '或者', '比较',
    ]);

    const words = normalizeText(text)
      .match(/[\u4e00-\u9fa5]{2,6}|[A-Za-z][A-Za-z0-9_-]{2,}/g) || [];

    const counts = new Map();
    for (const word of words) {
      const normalized = word.toLowerCase();
      if (stopWords.has(normalized) || /^\d+$/.test(normalized)) continue;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .slice(0, 6)
      .map(([word]) => word);
  }

  function pickPoints(sentences, keywords) {
    const selected = [];
    const seen = new Set();

    for (const sentence of sentences) {
      const hitCount = keywords.filter((keyword) => sentence.toLowerCase().includes(keyword)).length;
      const score = hitCount * 10 + Math.min(sentence.length, 80) / 20;
      if (score < 2.5) continue;

      const key = sentence.slice(0, 24);
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push({ sentence, score });
    }

    return selected
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_POINTS)
      .map((item) => item.sentence.replace(/[，,。.!！?？;；]+$/, ''));
  }

  function buildReply({ title, content }) {
    const sentences = getSentences(content);
    const keywords = extractKeywords(`${title}\n${content}`);
    const points = pickPoints(sentences, keywords);
    const topic = keywords.slice(0, 3).join('、') || title;

    const pointText = points.length
      ? `我比较关注这几处：${points.map((point) => `「${point}」`).join('；')}。`
      : '我大致看完后，感觉这个主题可以从背景、实际影响和后续处理几个角度继续讨论。';

    return [
      `看完楼主关于「${title}」的内容，我的理解是核心在于 ${topic}。`,
      pointText,
      '如果按实际使用/执行的角度看，我倾向于先把关键条件和边界说清楚，再看有没有可复现的例子或数据支撑。这样讨论会更容易收敛，也方便后面的人补充经验。',
    ].join('\n\n');
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
