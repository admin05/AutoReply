# Forum Reply Assistant

一个 Tampermonkey / 篡改猴脚本：在论坛帖子页把光标放进回帖输入框后，按 `Cmd+R`（macOS）或 `Ctrl+R`（Windows/Linux），脚本会读取本页主题内容，生成一段回帖草稿，并自动填入当前输入框。

## 安装

1. 打开 Tampermonkey 管理面板。
2. 新建脚本。
3. 把 `userscripts/forum-reply-assistant.user.js` 的内容粘贴进去并保存。
4. 默认 `@match *://*/*` 会在所有网页运行。建议改成目标论坛域名，例如：

```js
// @match        https://example.com/*
```

## 使用

1. 打开论坛帖子页。
2. 点击回帖输入框，让光标停在你想插入草稿的位置。
3. 按 `Cmd+R` / `Ctrl+R`。
4. 检查并手动修改草稿，再自己点击发布。

脚本只会生成并填入草稿，不会自动提交回复。

## 说明

- 脚本不调用外部 AI 或网络接口，只根据当前页面文本做本地提取和模板化生成。
- 支持普通 `textarea`、文本 `input` 和大多数 `contenteditable` 富文本编辑器。
- 如果目标论坛拦截快捷键或编辑器实现比较特殊，可能需要针对该论坛补充选择器。
- `Cmd+R` / `Ctrl+R` 默认是浏览器刷新快捷键。脚本识别到当前页面后会阻止刷新，用来生成回帖草稿。

