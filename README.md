# 楼层译文

SillyTavern 第三方扩展。为每个楼层单独保存和显示 AI 翻译结果，不写入消息正文，不调用 `updateMessageBlock`，不修改 `message.extra.display_text`。

## 安装

把整个 `floor-translator` 文件夹放到以下任一位置：

- 全局扩展：`public/scripts/extensions/third-party/floor-translator`
- 当前用户扩展：`data/default-user/extensions/floor-translator`

刷新 SillyTavern 后，在扩展列表中启用“楼层译文”。

## 说明

- 副 API 使用 OpenAI 兼容 `/v1/chat/completions`。
- 消息栏只添加一个翻译按钮；点击后打开当前楼层面板，在面板里开始/刷新翻译、管理译文版本。
- 当前回复已有译文时，正文开头会出现灰色的显示/取消译文按钮，不需要打开面板也能切换。
- 同一楼层的不同 swipe/候选回复会分开保存译文，切换回复时只显示当前回复自己的译文。
- 默认开启“防止酒馆自带翻译在切换候选回复时自动触发”。它只在本扩展运行时拦截 `MESSAGE_SWIPED` 期间的酒馆自带自动翻译，不修改 SillyTavern 本体文件，也不保存改动到酒馆自带翻译设置。
- 翻译请求会把正文拆成带编号的段落，并要求模型按 JSON 返回，前端再按编号把每段译文贴回对应原文。
- 翻译渠道可在 `AI 副 API`、`Google 快速翻译（免密）`、`Microsoft Translator` 之间切换；Google/Microsoft 会按段落并发请求，边返回边显示。Google 免密端点会把超长段落再切小块，避免 GET 地址过长导致 400。
- Google/Microsoft 渠道是前端直连，Microsoft Key 会保存在浏览器扩展设置里；公开分发前请提醒使用者自行填写自己的 Key。
- 这是普通第三方前端扩展，不修改 SillyTavern 本体文件。
- 默认“酒馆内置通道”只调用 SillyTavern 已有的 `/api/backends/chat-completions/generate`，由酒馆服务器访问副 API，所以不受浏览器 CORS 影响。
- 酒馆内置通道按 OpenAI 兼容接口发送请求，地址可填反代根地址或 `/v1` 地址，扩展会统一请求 `/chat/completions`。
- 前端直连模式用于副 API 已正确开放 CORS 的情况；“直连兼容模式”会减少 CORS 预检请求，但无法绕过完全未开放 CORS 的 API。
- 译文版本保存在浏览器 `localStorage`，按当前角色/群组、当前聊天、楼层编号隔离。
