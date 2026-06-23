// ==UserScript==
// @name         Forum Reply Assistant
// @namespace    https://github.com/admin05/AutoReply
// @version      1.0.4
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

  function includesAny(text, words) {
    return words.some((word) => text.includes(word));
  }

  function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function buildReply({ title, content }) {
    const source = `${title}\n${content}`;
    const congratulationsWords = ['恭喜', '中奖', '上岸', '通过', '录取', '成功', '喜提', '拿下', '达成', '毕业', '升职'];
    const thanksWords = ['教程', '经验', '分享', '整理', '攻略', '方法', '总结', '资料', '测评', '推荐', '避坑'];
    const questionWords = ['请问', '求助', '怎么', '如何', '有没有', '吗', '问题', '疑问', '讨论'];
    const updateWords = ['更新', '进展', '记录', '打卡', '复盘', '后续', '阶段'];

    if (includesAny(source, congratulationsWords)) {
      return pickRandom([
        '恭喜楼主，真的替你开心，这一路不容易，后面一定越来越顺！',
        '太棒了老板，这个结果值得庆祝，祝你接下来继续顺顺利利！',
        '恭喜恭喜，这波真的很稳，看到这种好消息也跟着开心！',
        '佬友太强了，努力终于有回报，祝后面还有更多好消息！',
      ]);
    }

    if (includesAny(source, thanksWords)) {
      return pickRandom([
        '感谢楼主分享，内容整理得很细，对后面查资料的人很有帮助！',
        '佬友这波分享很实在，信息量很足，先收藏慢慢学习一下！',
        '感谢整理，这种经验帖很有参考价值，能省下不少摸索时间！',
        '老板分享得很用心，重点也说得清楚，路过先支持一下！',
      ]);
    }

    if (includesAny(source, questionWords)) {
      return pickRandom([
        '楼主这个问题问得挺关键，蹲一个后续讨论，也想看看大家的经验。',
        '这个点确实值得聊聊，佬友提出来很有参考价值，期待更多补充。',
        '同关注这个问题，感觉不少人都会遇到，看看评论区有没有好办法。',
        '老板这个问题挺实际的，先帮顶一下，希望有懂的朋友来补充。',
      ]);
    }

    if (includesAny(source, updateWords)) {
      return pickRandom([
        '这个进展挺不错的，楼主持续更新很用心，期待后面更多好消息！',
        '记录得很清楚，看得出来一直在认真推进，后续可以继续蹲一蹲。',
        '佬友这个更新挺有参考意义，节奏也很稳，继续关注后面的变化。',
        '老板这波复盘很实在，过程写出来对后来的人也挺有帮助。',
      ]);
    }

    return pickRandom([
      '楼主写得挺自然的，内容看着很舒服，顺手支持一下！',
      '佬友这个帖子挺有意思，表达也很真诚，支持一下继续交流！',
      '老板这个内容看着很舒服，氛围也不错，来支持一波！',
      '这个角度还挺有意思的，楼主说得也比较清楚，支持继续分享。',
      '帖子整体看下来挺顺的，内容也有点意思，路过支持一下！',
      '楼主这个表达挺接地气的，看着不累，评论区也可以继续聊聊。',
      '佬友说得挺真诚的，内容有共鸣，顺手点个支持不过分。',
      '老板这帖挺有生活气的，看完感觉还不错，支持一下继续发。',
    ]);
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
