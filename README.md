# 楼层译文

SillyTavern 第三方扩展。为每个楼层单独保存和显示 AI 翻译结果，不写入消息正文，不调用 `updateMessageBlock`，不修改 `message.extra.display_text`。

## 安装

把整个 `floor-translator` 文件夹放到以下任一位置：

- 全局扩展：`public/scripts/extensions/third-party/floor-translator`
- 当前用户扩展：`data/default-user/extensions/floor-translator`

刷新 SillyTavern 后，在扩展列表中启用“楼层译文”。

## 说明

- 副 API 使用 OpenAI 兼容 `/v1/chat/completions`。
- 消息栏只添加一个翻译按钮；点击后打开当前楼层面板，在面板里开始/刷新翻译、显示译文或取消译文。
- 翻译请求会把正文拆成带编号的段落，并要求模型按 JSON 返回，前端再按编号把每段译文贴回对应原文。
- 译文版本保存在浏览器 `localStorage`，按当前角色/群组、当前聊天、楼层编号隔离。
- 纯前端直连反代时，反代需要允许浏览器 CORS。
