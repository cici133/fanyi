import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';

const EXTENSION_NAME = 'floorTranslator';
const STORAGE_PREFIX = 'stft-cache-v1';
const SETTINGS_ID = 'stft_settings';
const MODAL_ID = 'stft_modal';
const BUTTON_CLASS = 'stft-message-button';
const LEGACY_TOGGLE_CLASS = 'stft-toggle-button';
const LEGACY_PANEL_CLASS = 'stft-panel-button';
const ACTIVE_CLASS = 'stft-button-active';
const LOADING_CLASS = 'stft-button-loading';

const displayModes = {
    replace: 'replace',
    compare: 'compare',
};

const authModes = {
    bearer: 'bearer',
    xApiKey: 'x-api-key',
    custom: 'custom',
    none: 'none',
};

const languages = [
    ['auto', '自动识别'],
    ['Chinese (Simplified)', '中文（简体）'],
    ['Chinese (Traditional)', '中文（繁体）'],
    ['English', '英语'],
    ['Japanese', '日语'],
    ['Korean', '韩语'],
    ['French', '法语'],
    ['German', '德语'],
    ['Spanish', '西班牙语'],
    ['Italian', '意大利语'],
    ['Portuguese', '葡萄牙语'],
    ['Russian', '俄语'],
    ['Ukrainian', '乌克兰语'],
    ['Polish', '波兰语'],
    ['Dutch', '荷兰语'],
    ['Swedish', '瑞典语'],
    ['Norwegian', '挪威语'],
    ['Finnish', '芬兰语'],
    ['Danish', '丹麦语'],
    ['Turkish', '土耳其语'],
    ['Arabic', '阿拉伯语'],
    ['Hindi', '印地语'],
    ['Thai', '泰语'],
    ['Vietnamese', '越南语'],
    ['Indonesian', '印尼语'],
    ['custom', '自定义'],
];

const defaultPrompts = [
    {
        id: 'standard',
        name: '标准忠实翻译',
        text: '你是一名严谨的文学翻译。请忠实、准确、自然地把正文翻译成{{target_language}}。不添加解释，不省略信息；已经是目标语言、专名、代码、标记或不应翻译的片段要原样复制。',
        locked: true,
    },
    {
        id: 'ao3',
        name: 'AO3文手翻译风格',
        text: '你是一名熟悉 AO3 同人文语感的译者。请把正文翻译成{{target_language}}，保留情绪张力、暧昧停顿、人物口吻和细腻心理描写。译文要流畅、有网文阅读感，但不要过度改写。',
        locked: true,
    },
    {
        id: 'euro_novel',
        name: '欧式著作翻译',
        text: '你是一名欧陆文学译者。请把正文翻译成{{target_language}}，语体典雅、克制、具有文学质感，注意长句节奏、意象和叙述距离。不要添加注释。',
        locked: true,
    },
    {
        id: 'light_novel',
        name: '轻小说/网文润色',
        text: '你是一名轻小说和中文网文译者。请把正文翻译成{{target_language}}，译文自然顺口，人物台词有辨识度，叙述节奏轻快，必要时做轻微本地化润色。',
        locked: true,
    },
    {
        id: 'localized',
        name: '自然口语本地化',
        text: '你是一名本地化译者。请把正文翻译成{{target_language}}，优先保证读者读起来像目标语言原生表达，台词口语自然，叙事清楚。不要机械直译，不添加解释。',
        locked: true,
    },
];

const defaultSettings = {
    endpoint: '',
    model: 'gpt-4o-mini',
    apiKey: '',
    authMode: authModes.bearer,
    customAuthHeader: 'Authorization',
    temperature: 0.2,
    maxTokens: 4000,
    sourceLanguage: 'auto',
    targetLanguage: 'Chinese (Simplified)',
    customTargetLanguage: '',
    displayMode: displayModes.compare,
    autoShow: true,
    translateUserMessages: false,
    activePresetId: 'standard',
    prompts: defaultPrompts,
};

let settings = {};
let scanTimer = 0;
let observer = null;
const inFlight = new Map();

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getSettings() {
    if (!extension_settings[EXTENSION_NAME]) {
        extension_settings[EXTENSION_NAME] = {};
    }

    const stored = extension_settings[EXTENSION_NAME];
    const promptMap = new Map([...(stored.prompts || []), ...defaultPrompts].map(prompt => [prompt.id, prompt]));
    settings = {
        ...clone(defaultSettings),
        ...stored,
        prompts: Array.from(promptMap.values()),
    };
    extension_settings[EXTENSION_NAME] = settings;
    return settings;
}

function saveSettings() {
    extension_settings[EXTENSION_NAME] = settings;
    saveSettingsDebounced();
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/"/g, '\\"');
}

function makeId(prefix = 'stft') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function getChatKey() {
    const context = getContext();
    const chatId = context.getCurrentChatId?.() || context.chatId || 'no-chat';
    const scope = context.groupId ? `group:${context.groupId}` : `char:${context.characterId ?? 'neutral'}`;
    return `${scope}:${chatId}`;
}

function getStorageKey() {
    return `${STORAGE_PREFIX}:${getChatKey()}`;
}

function emptyStore() {
    return { version: 1, messages: {} };
}

function loadStore() {
    try {
        const raw = localStorage.getItem(getStorageKey());
        if (!raw) return emptyStore();
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.messages) return emptyStore();
        return parsed;
    } catch (error) {
        console.warn('[Floor Translator] Failed to load cache', error);
        return emptyStore();
    }
}

function saveStore(store) {
    try {
        localStorage.setItem(getStorageKey(), JSON.stringify(store));
    } catch (error) {
        toastr?.error?.('译文缓存保存失败，可能是浏览器本地存储空间不足。');
        console.error('[Floor Translator] Failed to save cache', error);
    }
}

function getMessageRecord(messageId) {
    const store = loadStore();
    const key = String(messageId);
    if (!store.messages[key]) {
        store.messages[key] = {
            visible: false,
            selectedId: null,
            displayMode: settings.displayMode,
            language: resolveTargetLanguage(),
            presetId: settings.activePresetId,
            status: 'idle',
            statusText: '未开始',
            versions: [],
        };
        saveStore(store);
    }
    return { store, record: store.messages[key] };
}

function updateMessageRecord(messageId, updater) {
    const store = loadStore();
    const key = String(messageId);
    const record = store.messages[key] || {
        visible: false,
        selectedId: null,
        displayMode: settings.displayMode,
        language: resolveTargetLanguage(),
        presetId: settings.activePresetId,
        status: 'idle',
        statusText: '未开始',
        versions: [],
    };
    updater(record);
    store.messages[key] = record;
    saveStore(store);
    return record;
}

function lastItem(array) {
    return Array.isArray(array) && array.length ? array[array.length - 1] : null;
}

function getSelectedVersion(record) {
    return record.versions.find(version => version.id === record.selectedId) || lastItem(record.versions);
}

function getMessageElement(messageId) {
    return $(`#chat .mes[mesid="${cssEscape(messageId)}"]`).first();
}

function getMessageData(messageId) {
    return getContext().chat?.[Number(messageId)];
}

function isTranslatableMessage($mes) {
    if (!$mes.length) return false;
    if (String($mes.attr('is_system')) === 'true') return false;
    if (String($mes.attr('is_user')) === 'true' && !settings.translateUserMessages) return false;
    const message = getMessageData($mes.attr('mesid'));
    return Boolean(String(message?.mes ?? '').trim());
}

function renderMarkdown(text, messageId) {
    const context = getContext();
    const message = getMessageData(messageId);
    try {
        if (typeof context.messageFormatting === 'function' && message) {
            return context.messageFormatting(String(text ?? ''), message.name, !!message.is_system, !!message.is_user, Number(messageId), {}, false);
        }
    } catch (error) {
        console.warn('[Floor Translator] messageFormatting failed', error);
    }
    return escapeHtml(text).replace(/\n/g, '<br>');
}

function splitParagraphs(text) {
    const normalized = String(text ?? '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];
    const blankSplit = normalized.split(/\n\s*\n+/).map(x => x.trim()).filter(Boolean);
    if (blankSplit.length > 1) return blankSplit;
    const lineSplit = normalized.split('\n').map(x => x.trim()).filter(Boolean);
    if (lineSplit.length > 1) return lineSplit;
    return [normalized];
}

function getSourceSegments(text) {
    return splitParagraphs(text).map((source, index) => ({
        id: index + 1,
        source,
    }));
}

function alignSegmentsFromText(originalText, translatedText) {
    const originals = getSourceSegments(originalText);
    const translations = splitParagraphs(translatedText);
    const count = Math.max(originals.length, translations.length);
    const segments = [];
    for (let i = 0; i < count; i++) {
        const source = originals[i]?.source ?? '';
        const translation = translations[i] ?? source;
        segments.push({
            id: originals[i]?.id ?? i + 1,
            source,
            translation,
        });
    }
    return segments;
}

function normalizeVersionSegments(version, originalText) {
    const originalSegments = getSourceSegments(originalText);
    if (Array.isArray(version?.segments) && version.segments.length) {
        return version.segments.map((segment, index) => {
            const source = String(segment.source ?? originalSegments[index]?.source ?? '').trim();
            const translation = String(segment.translation ?? segment.text ?? source).trim();
            return {
                id: Number(segment.id) || originalSegments[index]?.id || index + 1,
                source,
                translation: translation || source,
            };
        });
    }
    return alignSegmentsFromText(originalText, version?.text ?? version ?? '');
}

function renderCompareHtml(originalText, version, messageId) {
    const segments = normalizeVersionSegments(version, originalText);
    let html = '<div class="stft-render stft-compare-render">';
    html += '<div class="stft-translation-badge">译文对照</div>';
    for (const segment of segments) {
        const original = segment.source ?? '';
        const translation = segment.translation ?? '';
        html += '<div class="stft-compare-pair">';
        if (original) html += `<div class="stft-compare-original">${renderMarkdown(original, messageId)}</div>`;
        if (translation) html += `<div class="stft-compare-translation">${renderMarkdown(translation, messageId)}</div>`;
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function renderReplaceHtml(translatedText, messageId) {
    return `<div class="stft-render stft-replace-render"><div class="stft-translation-badge">译文</div>${renderMarkdown(translatedText, messageId)}</div>`;
}

function applyDisplay(messageId) {
    const $mes = getMessageElement(messageId);
    if (!$mes.length) return;
    const message = getMessageData(messageId);
    const { record } = getMessageRecord(messageId);
    const version = getSelectedVersion(record);
    const $text = $mes.find('.mes_text').first();

    if (!$text.length || !record.visible || !version || !message) {
        restoreDisplay(messageId, false);
        updateButtonState($mes);
        return;
    }

    const mode = record.displayMode || version.displayMode || settings.displayMode;
    const html = mode === displayModes.replace
        ? renderReplaceHtml(version.text, messageId)
        : renderCompareHtml(message.mes, version, messageId);

    if ($text.html() !== html) {
        $text.html(html);
    }
    updateButtonState($mes);
}

function restoreDisplay(messageId, updateRecord = true) {
    const $mes = getMessageElement(messageId);
    const message = getMessageData(messageId);
    const $text = $mes.find('.mes_text').first();
    if ($text.length && message) {
        const originalHtml = renderMarkdown(message.mes, messageId);
        if ($text.html() !== originalHtml) {
            $text.html(originalHtml);
        }
    }
    if (updateRecord) {
        updateMessageRecord(messageId, record => {
            record.visible = false;
        });
    }
    updateButtonState($mes);
}

function updateButtonState($mes) {
    if (!$mes?.length) return;
    const messageId = String($mes.attr('mesid'));
    const store = loadStore();
    const record = store.messages[messageId];
    const hasTranslation = Boolean(record?.versions?.length);
    const visible = Boolean(record?.visible && getSelectedVersion(record));
    const loading = inFlight.has(messageId);
    const title = loading
        ? '正在翻译...'
        : visible
            ? '取消译文 / 打开楼层译文面板'
            : hasTranslation
                ? '打开楼层译文面板'
                : '开始楼层翻译';
    $mes.find(`.${BUTTON_CLASS}`)
        .toggleClass(ACTIVE_CLASS, visible)
        .toggleClass(LOADING_CLASS, loading)
        .attr('title', title);
}

function queueScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
        ensureMessageButtons();
        reapplyVisibleDisplays();
    }, 80);
}

function ensureMessageButtons() {
    $('#chat .mes').each((_, element) => {
        const $mes = $(element);
        $mes.find(`.${LEGACY_TOGGLE_CLASS}, .${LEGACY_PANEL_CLASS}`).remove();
        if (!isTranslatableMessage($mes)) {
            $mes.find(`.${BUTTON_CLASS}`).remove();
            return;
        }
        const $buttons = $mes.find('.extraMesButtons').first();
        if (!$buttons.length) return;

        if (!$buttons.find(`.${BUTTON_CLASS}`).length) {
            $buttons.append(`<div title="楼层翻译" class="mes_button ${BUTTON_CLASS} fa-solid fa-language"></div>`);
        }
        updateButtonState($mes);
    });
}

function reapplyVisibleDisplays() {
    const store = loadStore();
    for (const [messageId, record] of Object.entries(store.messages || {})) {
        if (record?.visible) {
            applyDisplay(messageId);
        } else {
            updateButtonState(getMessageElement(messageId));
        }
    }
}

function resolveTargetLanguage(localValue = null, customValue = null) {
    const selected = localValue ?? settings.targetLanguage;
    if (selected === 'custom') {
        return String(customValue ?? settings.customTargetLanguage ?? '').trim() || '目标语言';
    }
    return selected;
}

function getPromptById(id) {
    return settings.prompts.find(prompt => prompt.id === id) || settings.prompts[0] || defaultPrompts[0];
}

function replacePromptVars(text, language, sourceLanguage) {
    return String(text ?? '')
        .replace(/\{\{target_language\}\}/g, language)
        .replace(/\{\{source_language\}\}/g, sourceLanguage || '自动识别');
}

function buildMessages(sourceText, language, presetId, sourceSegments = getSourceSegments(sourceText)) {
    const sourceLanguage = settings.sourceLanguage === 'auto' ? '自动识别' : settings.sourceLanguage;
    const prompt = getPromptById(presetId);
    const payload = {
        source_language: sourceLanguage,
        target_language: language,
        rules: [
            '只翻译正文，不翻译思维链、推理过程、system/developer/tool 内容或任何解释文字。',
            '不要输出思考过程，不要添加注释，不要使用 Markdown 代码块。',
            '保持 segments 数组长度、顺序和 id 完全一致。',
            '每个对象只填写对应 id 的 translation。',
            '如果某段已经是目标语言、专名、代码、标记、章节编号或不应翻译的片段，请在 translation 中原样复制。',
        ],
        segments: sourceSegments.map(segment => ({
            id: segment.id,
            text: segment.source,
        })),
    };
    return [
        {
            role: 'system',
            content: replacePromptVars(prompt.text, language, sourceLanguage),
        },
        {
            role: 'user',
            content: [
                '下面是需要翻译的正文段落。请严格按 JSON 返回，禁止输出 JSON 以外的任何内容。',
                '返回格式必须是：{"segments":[{"id":1,"translation":"..."}]}',
                'translation 里可以包含换行，但不要新增、删除或合并段落 id。',
                JSON.stringify(payload, null, 2),
            ].join('\n\n'),
        },
    ];
}

function stripJsonFence(text) {
    const value = String(text ?? '').trim();
    const match = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return match ? match[1].trim() : value;
}

function parseJsonLoose(text) {
    const value = stripJsonFence(text);
    try {
        return JSON.parse(value);
    } catch {
        const objectStart = value.indexOf('{');
        const objectEnd = value.lastIndexOf('}');
        if (objectStart !== -1 && objectEnd > objectStart) {
            try {
                return JSON.parse(value.slice(objectStart, objectEnd + 1));
            } catch {
                // Fall through to array extraction.
            }
        }

        const arrayStart = value.indexOf('[');
        const arrayEnd = value.lastIndexOf(']');
        if (arrayStart !== -1 && arrayEnd > arrayStart) {
            try {
                return JSON.parse(value.slice(arrayStart, arrayEnd + 1));
            } catch {
                return null;
            }
        }
        return null;
    }
}

function normalizeReturnedSegments(parsed, sourceSegments) {
    const list = Array.isArray(parsed)
        ? parsed
        : parsed?.segments || parsed?.translations || parsed?.items || parsed?.result;
    if (!Array.isArray(list)) return null;

    const byId = new Map();
    for (const item of list) {
        const id = Number(item?.id ?? item?.index ?? item?.paragraph_id);
        if (Number.isFinite(id)) {
            byId.set(id, item);
        }
    }

    return sourceSegments.map((sourceSegment, index) => {
        const item = byId.get(sourceSegment.id) || list[index] || {};
        const rawTranslation = item.translation ?? item.translated_text ?? item.text ?? item.target ?? '';
        const translation = String(rawTranslation ?? '').trim() || sourceSegment.source;
        return {
            id: sourceSegment.id,
            source: sourceSegment.source,
            translation,
        };
    });
}

function parseTranslationResponse(rawText, sourceText) {
    const sourceSegments = getSourceSegments(sourceText);
    const parsed = parseJsonLoose(rawText);
    const jsonSegments = parsed ? normalizeReturnedSegments(parsed, sourceSegments) : null;
    const segments = jsonSegments?.length ? jsonSegments : alignSegmentsFromText(sourceText, rawText);
    const text = segments.map(segment => segment.translation || segment.source).join('\n\n').trim();
    return {
        text,
        segments,
        raw: String(rawText ?? '').trim(),
        usedFallback: !jsonSegments?.length,
    };
}

function normalizeEndpoint(endpoint) {
    const trimmed = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
    return `${trimmed}/chat/completions`;
}

function buildHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const key = String(settings.apiKey || '').trim();
    if (!key || settings.authMode === authModes.none) return headers;

    if (settings.authMode === authModes.bearer) {
        headers.Authorization = `Bearer ${key}`;
    } else if (settings.authMode === authModes.xApiKey) {
        headers['x-api-key'] = key;
    } else if (settings.authMode === authModes.custom) {
        const headerName = String(settings.customAuthHeader || '').trim() || 'Authorization';
        headers[headerName] = key;
    }
    return headers;
}

async function requestTranslationText(sourceText, options) {
    const endpoint = normalizeEndpoint(settings.endpoint);
    if (!endpoint) throw new Error('请先在扩展设置里填写 OpenAI 兼容 API 地址。');
    if (!settings.model) throw new Error('请先填写翻译模型名。');
    const sourceSegments = getSourceSegments(sourceText);

    const body = {
        model: settings.model,
        messages: buildMessages(sourceText, options.language, options.presetId, sourceSegments),
        temperature: Number(settings.temperature) || 0,
        stream: false,
    };
    const maxTokens = Number(settings.maxTokens);
    if (Number.isFinite(maxTokens) && maxTokens > 0) {
        body.max_tokens = maxTokens;
    }

    let response;
    try {
        response = await fetch(endpoint, {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify(body),
        });
    } catch (error) {
        const message = error?.message || String(error);
        throw new Error(`请求没有发到翻译 API：${message}。手机端常见原因是 API 地址写了 127.0.0.1/localhost、HTTP/HTTPS 混用，或反代没有允许浏览器 CORS。`);
    }

    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = null;
    }

    if (!response.ok) {
        const messageText = data?.error?.message || text || response.statusText;
        throw new Error(`API ${response.status}: ${messageText}`);
    }

    const translated = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
    if (!String(translated).trim()) {
        throw new Error('API 返回成功，但没有找到译文内容。');
    }
    return parseTranslationResponse(translated, sourceText);
}

async function requestTranslation(messageId, options) {
    const message = getMessageData(messageId);
    const sourceText = String(message?.mes ?? '').trim();
    if (!sourceText) throw new Error('这个楼层没有可翻译正文。');
    return requestTranslationText(sourceText, options);
}

async function translateMessage(messageId, options = {}) {
    if (inFlight.has(String(messageId))) return;

    const localOptions = {
        language: options.language || resolveTargetLanguage(),
        presetId: options.presetId || settings.activePresetId,
        displayMode: options.displayMode || settings.displayMode,
        autoShow: options.autoShow ?? settings.autoShow,
    };

    inFlight.set(String(messageId), true);
    updateMessageRecord(messageId, record => {
        record.status = 'loading';
        record.statusText = '正在请求翻译 API，等待模型返回...';
        record.language = localOptions.language;
        record.presetId = localOptions.presetId;
        record.displayMode = localOptions.displayMode;
    });
    updateButtonState(getMessageElement(messageId));
    refreshModalIfOpen(messageId);

    try {
        const result = await requestTranslation(messageId, localOptions);
        const prompt = getPromptById(localOptions.presetId);
        const version = {
            id: makeId('ver'),
            text: result.text,
            segments: result.segments,
            usedFallback: result.usedFallback,
            language: localOptions.language,
            presetId: localOptions.presetId,
            presetName: prompt.name,
            displayMode: localOptions.displayMode,
            createdAt: new Date().toISOString(),
            sourceHash: hashText(getMessageData(messageId)?.mes || ''),
        };

        updateMessageRecord(messageId, record => {
            record.status = 'success';
            record.statusText = result.usedFallback
                ? '翻译完成，但模型没有按 JSON 返回，已按段落尽量匹配。'
                : '翻译完成。';
            record.versions.push(version);
            record.selectedId = version.id;
            record.visible = Boolean(localOptions.autoShow);
            record.displayMode = localOptions.displayMode;
        });

        if (localOptions.autoShow) applyDisplay(messageId);
        else updateButtonState(getMessageElement(messageId));
        refreshModalIfOpen(messageId);
        toastr?.success?.('楼层翻译完成。');
    } catch (error) {
        updateMessageRecord(messageId, record => {
            record.status = 'error';
            record.statusText = error?.message || String(error);
        });
        updateButtonState(getMessageElement(messageId));
        refreshModalIfOpen(messageId);
        toastr?.error?.(error?.message || String(error), '楼层翻译失败');
    } finally {
        inFlight.delete(String(messageId));
        updateButtonState(getMessageElement(messageId));
        refreshModalIfOpen(messageId);
    }
}

function hashText(text) {
    let hash = 0;
    const value = String(text ?? '');
    for (let i = 0; i < value.length; i++) {
        hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
    }
    return String(hash);
}

function languageOptions(selected) {
    return languages.map(([value, label]) => `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function promptOptions(selected) {
    return settings.prompts.map(prompt => `<option value="${escapeHtml(prompt.id)}"${prompt.id === selected ? ' selected' : ''}>${escapeHtml(prompt.name)}</option>`).join('');
}

function renderSettingsPanel() {
    if ($(`#${SETTINGS_ID}`).length) return;
    const prompt = getPromptById(settings.activePresetId);
    const html = `
        <div id="${SETTINGS_ID}" class="stft-settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>楼层译文</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <div class="stft-grid">
                        <label class="stft-span-2">OpenAI 兼容 API 地址
                            <input id="stft_endpoint" class="text_pole" placeholder="http://127.0.0.1:8000/v1" value="${escapeHtml(settings.endpoint)}">
                        </label>
                        <label>模型
                            <input id="stft_model" class="text_pole" placeholder="gpt-4o-mini" value="${escapeHtml(settings.model)}">
                        </label>
                        <label>温度
                            <input id="stft_temperature" class="text_pole" type="number" step="0.1" min="0" max="2" value="${escapeHtml(settings.temperature)}">
                        </label>
                        <label>API Key / 反代密码
                            <input id="stft_api_key" class="text_pole" type="password" autocomplete="off" value="${escapeHtml(settings.apiKey)}">
                        </label>
                        <label>鉴权方式
                            <select id="stft_auth_mode" class="text_pole">
                                <option value="${authModes.bearer}"${settings.authMode === authModes.bearer ? ' selected' : ''}>Authorization: Bearer</option>
                                <option value="${authModes.xApiKey}"${settings.authMode === authModes.xApiKey ? ' selected' : ''}>x-api-key</option>
                                <option value="${authModes.custom}"${settings.authMode === authModes.custom ? ' selected' : ''}>自定义请求头</option>
                                <option value="${authModes.none}"${settings.authMode === authModes.none ? ' selected' : ''}>不发送密码</option>
                            </select>
                        </label>
                        <label id="stft_custom_header_label">自定义请求头名
                            <input id="stft_custom_header" class="text_pole" value="${escapeHtml(settings.customAuthHeader)}">
                        </label>
                        <label>最大输出 tokens
                            <input id="stft_max_tokens" class="text_pole" type="number" min="0" step="1" value="${escapeHtml(settings.maxTokens)}">
                        </label>
                        <label>源语言
                            <select id="stft_source_language" class="text_pole">${languageOptions(settings.sourceLanguage)}</select>
                        </label>
                        <label>默认目标语言
                            <select id="stft_target_language" class="text_pole">${languageOptions(settings.targetLanguage)}</select>
                        </label>
                        <label id="stft_custom_language_label">自定义目标语言
                            <input id="stft_custom_language" class="text_pole" value="${escapeHtml(settings.customTargetLanguage)}">
                        </label>
                        <label>默认显示模式
                            <select id="stft_display_mode" class="text_pole">
                                <option value="${displayModes.compare}"${settings.displayMode === displayModes.compare ? ' selected' : ''}>每段原文 + 译文对照</option>
                                <option value="${displayModes.replace}"${settings.displayMode === displayModes.replace ? ' selected' : ''}>只显示译文，替换正文</option>
                            </select>
                        </label>
                        <label>默认提示词预设
                            <select id="stft_prompt_select" class="text_pole">${promptOptions(settings.activePresetId)}</select>
                        </label>
                        <label class="checkbox_label stft-span-2">
                            <input id="stft_auto_show" type="checkbox"${settings.autoShow ? ' checked' : ''}>
                            翻译完成后自动显示
                        </label>
                        <label class="checkbox_label stft-span-2">
                            <input id="stft_translate_users" type="checkbox"${settings.translateUserMessages ? ' checked' : ''}>
                            用户消息也显示楼层翻译按钮
                        </label>
                        <label class="stft-span-2">当前预设名称
                            <input id="stft_prompt_name" class="text_pole" value="${escapeHtml(prompt.name)}">
                        </label>
                        <label class="stft-span-2">提示词内容
                            <textarea id="stft_prompt_text" class="text_pole" spellcheck="false">${escapeHtml(prompt.text)}</textarea>
                        </label>
                    </div>
                    <div class="stft-row marginTop10">
                        <div id="stft_prompt_save" class="menu_button">保存预设</div>
                        <div id="stft_prompt_new" class="menu_button"><i class="fa-solid fa-plus"></i><span>新建</span></div>
                        <div id="stft_prompt_delete" class="menu_button"><i class="fa-solid fa-trash-can"></i><span>删除</span></div>
                        <div id="stft_test_api" class="menu_button"><i class="fa-solid fa-plug"></i><span>测试 API</span></div>
                    </div>
                    <div id="stft_global_status" class="stft-status stft-muted marginTop10">
                        副 API 独立于酒馆主 API。纯前端直连反代时，反代需要允许浏览器 CORS。
                    </div>
                </div>
            </div>
        </div>`;
    $('#extensions_settings2').append(html);
    bindSettingsPanel();
    refreshConditionalSettings();
}

function bindSettingsPanel() {
    const setAndSave = (key, value) => {
        settings[key] = value;
        saveSettings();
    };

    $('#stft_endpoint').on('input', event => setAndSave('endpoint', event.target.value.trim()));
    $('#stft_model').on('input', event => setAndSave('model', event.target.value.trim()));
    $('#stft_api_key').on('input', event => setAndSave('apiKey', event.target.value));
    $('#stft_auth_mode').on('change', event => {
        setAndSave('authMode', event.target.value);
        refreshConditionalSettings();
    });
    $('#stft_custom_header').on('input', event => setAndSave('customAuthHeader', event.target.value.trim()));
    $('#stft_temperature').on('input', event => setAndSave('temperature', Number(event.target.value)));
    $('#stft_max_tokens').on('input', event => setAndSave('maxTokens', Number(event.target.value)));
    $('#stft_source_language').on('change', event => setAndSave('sourceLanguage', event.target.value));
    $('#stft_target_language').on('change', event => {
        setAndSave('targetLanguage', event.target.value);
        refreshConditionalSettings();
    });
    $('#stft_custom_language').on('input', event => setAndSave('customTargetLanguage', event.target.value.trim()));
    $('#stft_display_mode').on('change', event => setAndSave('displayMode', event.target.value));
    $('#stft_auto_show').on('change', event => setAndSave('autoShow', event.target.checked));
    $('#stft_translate_users').on('change', event => {
        setAndSave('translateUserMessages', event.target.checked);
        queueScan();
    });
    $('#stft_prompt_select').on('change', event => {
        settings.activePresetId = event.target.value;
        const prompt = getPromptById(settings.activePresetId);
        $('#stft_prompt_name').val(prompt.name);
        $('#stft_prompt_text').val(prompt.text);
        saveSettings();
    });
    $('#stft_prompt_save').on('click', saveCurrentPrompt);
    $('#stft_prompt_new').on('click', createPrompt);
    $('#stft_prompt_delete').on('click', deleteCurrentPrompt);
    $('#stft_test_api').on('click', testApi);
}

function refreshConditionalSettings() {
    $('#stft_custom_header_label').toggle(settings.authMode === authModes.custom);
    $('#stft_custom_language_label').toggle(settings.targetLanguage === 'custom');
}

function refreshPromptSelect() {
    $('#stft_prompt_select').html(promptOptions(settings.activePresetId));
}

function saveCurrentPrompt() {
    const id = settings.activePresetId;
    const prompt = getPromptById(id);
    const nextName = String($('#stft_prompt_name').val() || '').trim();
    const nextText = String($('#stft_prompt_text').val() || '').trim();
    if (!nextName || !nextText) {
        toastr?.error?.('预设名称和提示词都不能为空。');
        return;
    }
    if (prompt.locked) {
        const copy = { id: makeId('prompt'), name: `${nextName} 副本`, text: nextText, locked: false };
        settings.prompts.push(copy);
        settings.activePresetId = copy.id;
    } else {
        prompt.name = nextName;
        prompt.text = nextText;
    }
    saveSettings();
    refreshPromptSelect();
    toastr?.success?.('提示词预设已保存。');
}

function createPrompt() {
    const prompt = {
        id: makeId('prompt'),
        name: '自定义翻译预设',
        text: '请把正文翻译成{{target_language}}，语气自然，忠实保留信息。已经是目标语言或不应翻译的片段请原样复制。',
        locked: false,
    };
    settings.prompts.push(prompt);
    settings.activePresetId = prompt.id;
    saveSettings();
    refreshPromptSelect();
    $('#stft_prompt_name').val(prompt.name);
    $('#stft_prompt_text').val(prompt.text);
}

function deleteCurrentPrompt() {
    const prompt = getPromptById(settings.activePresetId);
    if (prompt.locked) {
        toastr?.warning?.('内置预设不能删除。');
        return;
    }
    settings.prompts = settings.prompts.filter(item => item.id !== prompt.id);
    settings.activePresetId = settings.prompts[0]?.id || 'standard';
    const next = getPromptById(settings.activePresetId);
    saveSettings();
    refreshPromptSelect();
    $('#stft_prompt_name').val(next.name);
    $('#stft_prompt_text').val(next.text);
}

async function testApi() {
    $('#stft_global_status').text('正在测试 API...');
    try {
        const result = await requestTranslationText('The rain had stopped, but the city still smelled like summer thunder.', {
            language: resolveTargetLanguage(),
            presetId: settings.activePresetId,
        });
        $('#stft_global_status').text(`API 测试成功：${result.text.slice(0, 120)}`);
    } catch (error) {
        $('#stft_global_status').text(`API 测试失败：${error.message}`);
    }
}

function buildFloorModal(messageId) {
    const { record } = getMessageRecord(messageId);
    if (!record.language) record.language = resolveTargetLanguage();
    if (!record.presetId) record.presetId = settings.activePresetId;
    if (!record.displayMode) record.displayMode = settings.displayMode;

    const message = getMessageData(messageId);
    const floor = getMessageElement(messageId).find('.mesIDDisplay').first().text() || `#${messageId}`;
    const customLanguageSelected = record.language && !languages.some(([value]) => value === record.language);
    const selectedLanguage = customLanguageSelected ? 'custom' : (record.language || settings.targetLanguage);
    const customLanguage = customLanguageSelected ? record.language : settings.customTargetLanguage;
    const selected = getSelectedVersion(record);

    return `
        <div id="${MODAL_ID}" data-message-id="${escapeHtml(messageId)}">
            <div class="stft-modal-card">
                <div class="stft-modal-head">
                    <div class="stft-modal-title">楼层译文 ${escapeHtml(floor)}</div>
                    <div class="menu_button menu_button_icon fa-solid fa-xmark" data-stft-close title="关闭"></div>
                </div>
                <div class="stft-modal-body">
                    <div class="stft-status" id="stft_modal_status">${escapeHtml(record.statusText || '未开始')}</div>
                    <div class="stft-grid">
                        <label>目标语言
                            <select id="stft_modal_language" class="text_pole">${languageOptions(selectedLanguage)}</select>
                        </label>
                        <label id="stft_modal_custom_language_label">自定义目标语言
                            <input id="stft_modal_custom_language" class="text_pole" value="${escapeHtml(customLanguage)}">
                        </label>
                        <label>提示词预设
                            <select id="stft_modal_preset" class="text_pole">${promptOptions(record.presetId || settings.activePresetId)}</select>
                        </label>
                        <label>显示模式
                            <select id="stft_modal_mode" class="text_pole">
                                <option value="${displayModes.compare}"${record.displayMode === displayModes.compare ? ' selected' : ''}>每段原文 + 译文对照</option>
                                <option value="${displayModes.replace}"${record.displayMode === displayModes.replace ? ' selected' : ''}>只显示译文，替换正文</option>
                            </select>
                        </label>
                    </div>
                    <label class="checkbox_label">
                        <input id="stft_modal_auto_show" type="checkbox"${settings.autoShow ? ' checked' : ''}>
                        本次翻译完成后自动显示
                    </label>
                    <div class="stft-row">
                        <div id="stft_modal_translate" class="menu_button">
                            <i class="fa-solid fa-rotate"></i><span>${record.versions.length ? '刷新翻译' : '开始翻译'}</span>
                        </div>
                        <div id="stft_modal_toggle" class="menu_button">
                            <i class="fa-solid fa-language"></i><span>${record.visible ? '取消译文' : '显示译文'}</span>
                        </div>
                        <div id="stft_modal_delete_all" class="menu_button">
                            <i class="fa-solid fa-trash-can"></i><span>清空本楼层译文</span>
                        </div>
                    </div>
                    <div class="stft-muted">当前选中：${selected ? escapeHtml(selected.presetName || '未命名') + ' / ' + escapeHtml(selected.language || '') : '没有译文版本'}</div>
                    <div class="stft-version-list">${renderVersionList(messageId, record, message)}</div>
                </div>
            </div>
        </div>`;
}

function renderVersionList(messageId, record, message) {
    if (!record.versions?.length) {
        return '<div class="stft-empty">这个楼层还没有保存的译文。点击“开始翻译”后，旧译文会留在这里供你切换、编辑或删除。</div>';
    }

    return record.versions.slice().reverse().map(version => {
        const selected = version.id === record.selectedId;
        const sourceChanged = version.sourceHash && message && version.sourceHash !== hashText(message.mes || '');
        return `
            <div class="stft-version${selected ? ' stft-selected' : ''}" data-version-id="${escapeHtml(version.id)}">
                <div class="stft-version-head">
                    <div>
                        <b>${escapeHtml(version.presetName || '译文')}</b>
                        <div class="stft-version-meta">${escapeHtml(formatDate(version.createdAt))} · ${escapeHtml(version.language || '')}${sourceChanged ? ' · 原文已变化' : ''}</div>
                    </div>
                    <div class="stft-row">
                        <div class="menu_button menu_button_icon fa-solid fa-pencil" data-stft-edit title="编辑"></div>
                        <div class="menu_button menu_button_icon fa-solid fa-trash-can" data-stft-delete title="删除"></div>
                    </div>
                </div>
                <div class="stft-version-preview">${escapeHtml(version.text).slice(0, 700)}</div>
            </div>`;
    }).join('');
}

function formatDate(value) {
    try {
        return new Date(value).toLocaleString();
    } catch {
        return '';
    }
}

function openFloorModal(messageId) {
    closeFloorModal();
    $('body').append(buildFloorModal(messageId));
    bindFloorModal(messageId);
}

function refreshModalIfOpen(messageId) {
    const $modal = $(`#${MODAL_ID}`);
    if (!$modal.length || String($modal.data('message-id')) !== String(messageId)) return;
    openFloorModal(messageId);
}

function closeFloorModal() {
    $(`#${MODAL_ID}`).remove();
}

function modalOptions() {
    const languageSelect = $('#stft_modal_language').val();
    const customLanguage = String($('#stft_modal_custom_language').val() || '').trim();
    return {
        language: resolveTargetLanguage(languageSelect, customLanguage),
        presetId: String($('#stft_modal_preset').val() || settings.activePresetId),
        displayMode: String($('#stft_modal_mode').val() || settings.displayMode),
        autoShow: $('#stft_modal_auto_show').prop('checked'),
    };
}

function bindFloorModal(messageId) {
    const refreshLanguageVisibility = () => {
        $('#stft_modal_custom_language_label').toggle($('#stft_modal_language').val() === 'custom');
    };

    refreshLanguageVisibility();
    $(`#${MODAL_ID}`).on('click', event => {
        if (event.target.id === MODAL_ID) closeFloorModal();
    });
    $('[data-stft-close]').on('click', closeFloorModal);
    $('#stft_modal_language').on('change', refreshLanguageVisibility);
    $('#stft_modal_translate').on('click', () => translateMessage(messageId, modalOptions()));
    $('#stft_modal_toggle').on('click', () => toggleDisplay(messageId, true));
    $('#stft_modal_delete_all').on('click', () => {
        updateMessageRecord(messageId, record => {
            record.visible = false;
            record.selectedId = null;
            record.versions = [];
            record.status = 'idle';
            record.statusText = '已清空本楼层译文。';
        });
        restoreDisplay(messageId, false);
        openFloorModal(messageId);
    });
    $('#stft_modal_mode').on('change', () => {
        const mode = String($('#stft_modal_mode').val());
        updateMessageRecord(messageId, record => {
            record.displayMode = mode;
        });
        applyDisplay(messageId);
    });

    $('.stft-version').on('click', function (event) {
        if ($(event.target).closest('[data-stft-edit], [data-stft-delete], [data-stft-save], [data-stft-cancel]').length) return;
        const versionId = String($(this).data('version-id'));
        updateMessageRecord(messageId, record => {
            record.selectedId = versionId;
            record.statusText = '已选中这个译文版本。';
        });
        applyDisplay(messageId);
        openFloorModal(messageId);
    });

    $('[data-stft-edit]').on('click', function (event) {
        event.stopPropagation();
        startEditVersion($(this).closest('.stft-version'));
    });

    $('[data-stft-delete]').on('click', function (event) {
        event.stopPropagation();
        const versionId = String($(this).closest('.stft-version').data('version-id'));
        deleteVersion(messageId, versionId);
    });
}

function startEditVersion($version) {
    const messageId = String($(`#${MODAL_ID}`).data('message-id'));
    const versionId = String($version.data('version-id'));
    const { record } = getMessageRecord(messageId);
    const version = record.versions.find(item => item.id === versionId);
    if (!version) return;

    $version.find('.stft-version-preview').replaceWith(`
        <textarea class="text_pole stft-version-editor" spellcheck="false">${escapeHtml(version.text)}</textarea>
        <div class="stft-row marginTop5">
            <div class="menu_button menu_button_icon fa-solid fa-check" data-stft-save title="保存"></div>
            <div class="menu_button menu_button_icon fa-solid fa-xmark" data-stft-cancel title="取消"></div>
        </div>`);

    $version.find('[data-stft-save]').on('click', event => {
        event.stopPropagation();
        const nextText = String($version.find('.stft-version-editor').val() || '').trim();
        if (!nextText) {
            toastr?.error?.('译文不能为空。');
            return;
        }
        updateMessageRecord(messageId, nextRecord => {
            const target = nextRecord.versions.find(item => item.id === versionId);
            if (target) {
                target.text = nextText;
                target.segments = alignSegmentsFromText(getMessageData(messageId)?.mes || '', nextText);
                target.editedAt = new Date().toISOString();
                nextRecord.selectedId = versionId;
                nextRecord.statusText = '译文已编辑保存。';
            }
        });
        applyDisplay(messageId);
        openFloorModal(messageId);
    });

    $version.find('[data-stft-cancel]').on('click', event => {
        event.stopPropagation();
        openFloorModal(messageId);
    });
}

function deleteVersion(messageId, versionId) {
    updateMessageRecord(messageId, record => {
        record.versions = record.versions.filter(item => item.id !== versionId);
        if (record.selectedId === versionId) {
            record.selectedId = lastItem(record.versions)?.id || null;
        }
        if (!record.selectedId) {
            record.visible = false;
        }
        record.statusText = '译文版本已删除。';
    });
    const { record } = getMessageRecord(messageId);
    if (record.visible && record.selectedId) applyDisplay(messageId);
    else restoreDisplay(messageId, false);
    openFloorModal(messageId);
}

function toggleDisplay(messageId, fromModal = false) {
    const { record } = getMessageRecord(messageId);
    const selected = getSelectedVersion(record);
    if (!selected) {
        openFloorModal(messageId);
        return;
    }
    updateMessageRecord(messageId, nextRecord => {
        nextRecord.visible = !nextRecord.visible;
    });
    const updated = getMessageRecord(messageId).record;
    if (updated.visible) applyDisplay(messageId);
    else restoreDisplay(messageId, false);
    if (fromModal) openFloorModal(messageId);
}

function bindMessageButtons() {
    $(document).off('click.floorTranslator');
    $(document).on('click.floorTranslator', `.${BUTTON_CLASS}`, function (event) {
        event.preventDefault();
        event.stopPropagation();
        openFloorModal(String($(this).closest('.mes').attr('mesid')));
    });
}

function bindEvents() {
    const eventsToScan = [
        event_types.CHAT_CHANGED,
        event_types.CHARACTER_MESSAGE_RENDERED,
        event_types.USER_MESSAGE_RENDERED,
        event_types.MESSAGE_UPDATED,
        event_types.MESSAGE_SWIPED,
        event_types.GENERATION_ENDED,
        event_types.GENERATION_STOPPED,
    ];
    for (const eventName of eventsToScan) {
        eventSource.on(eventName, () => queueScan());
    }
}

function startObserver() {
    const chat = document.querySelector('#chat');
    if (!chat) return;
    observer = new MutationObserver(queueScan);
    observer.observe(chat, { childList: true, subtree: true });
}

async function init() {
    try {
        getSettings();
        renderSettingsPanel();
        bindMessageButtons();
        bindEvents();
        ensureMessageButtons();
        startObserver();
        reapplyVisibleDisplays();
        console.info('[Floor Translator] loaded');
    } catch (error) {
        console.error('[Floor Translator] init failed', error);
        toastr?.error?.(error?.message || String(error), '楼层译文加载失败');
    }
}

jQuery(() => void init());
