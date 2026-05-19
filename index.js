import { eventSource, event_types, getRequestHeaders, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';

const EXTENSION_NAME = 'floorTranslator';
const STORAGE_PREFIX = 'stft-cache-v1';
const SETTINGS_ID = 'stft_settings';
const MODAL_ID = 'stft_modal';
const BUTTON_CLASS = 'stft-message-button';
const INLINE_TOGGLE_CLASS = 'stft-inline-toggle';
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

const requestModes = {
    tavern: 'tavern',
    standard: 'standard',
    simple: 'simple',
};

const translationChannels = {
    ai: 'ai',
    google: 'google',
    microsoft: 'microsoft',
};

const BUILTIN_TRANSLATE_SWIPE_GUARD_KEY = '__floorTranslatorSwipeGuardInstalled';
const builtinTranslateIncomingModes = new Set(['responses', 'both']);
const machineConcurrency = 4;
const googleChunkLength = 1300;

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

const languagePromptNames = {
    auto: '自动识别',
    'Chinese (Simplified)': '简体中文',
    'Chinese (Traditional)': '繁体中文',
    English: '英语',
    Japanese: '日语',
    Korean: '韩语',
    French: '法语',
    German: '德语',
    Spanish: '西班牙语',
    Italian: '意大利语',
    Portuguese: '葡萄牙语',
    Russian: '俄语',
    Ukrainian: '乌克兰语',
    Polish: '波兰语',
    Dutch: '荷兰语',
    Swedish: '瑞典语',
    Norwegian: '挪威语',
    Finnish: '芬兰语',
    Danish: '丹麦语',
    Turkish: '土耳其语',
    Arabic: '阿拉伯语',
    Hindi: '印地语',
    Thai: '泰语',
    Vietnamese: '越南语',
    Indonesian: '印尼语',
};

const googleLanguageCodes = {
    'Chinese (Simplified)': 'zh-CN',
    'Chinese (Traditional)': 'zh-TW',
    English: 'en',
    Japanese: 'ja',
    Korean: 'ko',
    French: 'fr',
    German: 'de',
    Spanish: 'es',
    Italian: 'it',
    Portuguese: 'pt',
    Russian: 'ru',
    Ukrainian: 'uk',
    Polish: 'pl',
    Dutch: 'nl',
    Swedish: 'sv',
    Norwegian: 'no',
    Finnish: 'fi',
    Danish: 'da',
    Turkish: 'tr',
    Arabic: 'ar',
    Hindi: 'hi',
    Thai: 'th',
    Vietnamese: 'vi',
    Indonesian: 'id',
};

const microsoftLanguageCodes = {
    ...googleLanguageCodes,
    'Chinese (Simplified)': 'zh-Hans',
    'Chinese (Traditional)': 'zh-Hant',
    Norwegian: 'nb',
};

const defaultPrompts = [
    {
        id: 'standard',
        name: '标准忠实翻译',
        text: '你是一名严谨的文学翻译。请忠实、准确、自然地把正文翻译成{{target_language}}。如果正文不是{{target_language}}，必须翻译，不能照抄原文。不添加解释，不省略信息；只有已经是{{target_language}}、专名、代码、标记或不应翻译的片段才原样复制。',
        locked: true,
    },
    {
        id: 'ao3',
        name: 'AO3文手翻译风格',
        text: '你是一名熟悉 AO3 同人文语感的译者。请把正文翻译成{{target_language}}。如果正文不是{{target_language}}，必须翻译，不能照抄原文。保留情绪张力、暧昧停顿、人物口吻和细腻心理描写。译文要流畅、有网文阅读感，但不要过度改写。',
        locked: true,
    },
    {
        id: 'euro_novel',
        name: '欧式著作翻译',
        text: '你是一名欧陆文学译者。请把正文翻译成{{target_language}}。如果正文不是{{target_language}}，必须翻译，不能照抄原文。语体典雅、克制、具有文学质感，注意长句节奏、意象和叙述距离。不要添加注释。',
        locked: true,
    },
    {
        id: 'light_novel',
        name: '轻小说/网文润色',
        text: '你是一名轻小说和中文网文译者。请把正文翻译成{{target_language}}。如果正文不是{{target_language}}，必须翻译，不能照抄原文。译文自然顺口，人物台词有辨识度，叙述节奏轻快，必要时做轻微本地化润色。',
        locked: true,
    },
    {
        id: 'localized',
        name: '自然口语本地化',
        text: '你是一名本地化译者。请把正文翻译成{{target_language}}。如果正文不是{{target_language}}，必须翻译，不能照抄原文。优先保证读者读起来像目标语言原生表达，台词口语自然，叙事清楚。不要机械直译，不添加解释。',
        locked: true,
    },
];

const defaultSettings = {
    translationChannel: translationChannels.ai,
    endpoint: '',
    model: 'gpt-4o-mini',
    apiKey: '',
    authMode: authModes.bearer,
    customAuthHeader: 'Authorization',
    requestMode: requestModes.tavern,
    microsoftKey: '',
    microsoftRegion: '',
    microsoftEndpoint: 'https://api.cognitive.microsofttranslator.com',
    temperature: 0.2,
    maxTokens: 4000,
    sourceLanguage: 'auto',
    targetLanguage: 'Chinese (Simplified)',
    customTargetLanguage: '',
    displayMode: displayModes.compare,
    autoShow: true,
    translateUserMessages: false,
    suppressBuiltinSwipeTranslate: true,
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

function shouldSuppressBuiltinSwipeTranslate() {
    return extension_settings[EXTENSION_NAME]?.suppressBuiltinSwipeTranslate !== false;
}

function installBuiltinSwipeTranslateGuard() {
    if (eventSource[BUILTIN_TRANSLATE_SWIPE_GUARD_KEY]) return;

    const originalEmit = eventSource.emit.bind(eventSource);
    eventSource.emit = async function guardedEmit(eventName, ...args) {
        const translateSettings = extension_settings.translate;
        const originalAutoMode = translateSettings?.auto_mode;
        const shouldMute = eventName === event_types.MESSAGE_SWIPED
            && shouldSuppressBuiltinSwipeTranslate()
            && builtinTranslateIncomingModes.has(originalAutoMode);

        if (!shouldMute) {
            return originalEmit(eventName, ...args);
        }

        translateSettings.auto_mode = 'none';
        try {
            return await originalEmit(eventName, ...args);
        } finally {
            if (translateSettings.auto_mode === 'none') {
                translateSettings.auto_mode = originalAutoMode;
            }
        }
    };

    eventSource[BUILTIN_TRANSLATE_SWIPE_GUARD_KEY] = true;
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

function createDefaultRecord() {
    return {
        visible: false,
        selectedId: null,
        displayMode: settings.displayMode,
        language: resolveTargetLanguage(),
        presetId: settings.activePresetId,
        status: 'idle',
        statusText: '未开始',
        versions: [],
    };
}

function getMessageSourceText(messageId) {
    return String(getMessageData(messageId)?.mes ?? '').trim();
}

function getMessageRecordKey(messageId) {
    return `${String(messageId)}::reply:${hashText(getMessageSourceText(messageId))}`;
}

function getMessageIdFromRecordKey(recordKey) {
    return String(recordKey).split('::')[0];
}

function getEventMessageId(payload) {
    if (payload && typeof payload === 'object') {
        return payload.messageId ?? payload.id ?? payload.mesId;
    }
    return payload;
}

function getReplyLabel(messageId) {
    const message = getMessageData(messageId);
    if (!message || !Array.isArray(message.swipes) || message.swipes.length <= 1) return '';
    const swipeId = Number.isInteger(message.swipe_id) ? message.swipe_id : 0;
    return `回复 ${swipeId + 1}/${message.swipes.length}`;
}

function getLiveReplyHashes(message) {
    const values = new Set();
    const sourceTexts = Array.isArray(message?.swipes) && message.swipes.length
        ? message.swipes
        : [message?.mes];
    for (const sourceText of sourceTexts) {
        const text = String(sourceText ?? '').trim();
        if (text) values.add(hashText(text));
    }
    const currentText = String(message?.mes ?? '').trim();
    if (currentText) values.add(hashText(currentText));
    return values;
}

function pruneMissingRecords() {
    const store = loadStore();
    const chat = getContext().chat || [];
    let changed = false;

    for (const key of Object.keys(store.messages || {})) {
        const messageId = getMessageIdFromRecordKey(key);
        const message = chat[Number(messageId)];
        if (!message) {
            delete store.messages[key];
            changed = true;
            continue;
        }

        const match = String(key).match(/::reply:(.+)$/);
        if (match && !getLiveReplyHashes(message).has(match[1])) {
            delete store.messages[key];
            changed = true;
        }
    }

    if (changed) saveStore(store);
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
    const key = getMessageRecordKey(messageId);
    const legacyKey = String(messageId);
    const message = getMessageData(messageId);
    const canMigrateLegacy = !Array.isArray(message?.swipes) || message.swipes.length <= 1 || Number(message.swipe_id ?? 0) === 0;
    if (!store.messages[key] && store.messages[legacyKey] && canMigrateLegacy) {
        store.messages[key] = store.messages[legacyKey];
        delete store.messages[legacyKey];
        saveStore(store);
    }
    if (!store.messages[key]) {
        store.messages[key] = createDefaultRecord();
        saveStore(store);
    }
    return { store, record: store.messages[key] };
}

function updateMessageRecord(messageId, updater, recordKey = getMessageRecordKey(messageId)) {
    const store = loadStore();
    const key = String(recordKey);
    const record = store.messages[key] || createDefaultRecord();
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

function isDisplayableVersion(version) {
    if (!version) return false;
    if (String(version.text ?? '').trim()) return true;
    return Array.isArray(version.segments) && version.segments.some(segment => String(segment.translation ?? '').trim());
}

function hasDisplayableVersion(record) {
    if (!record?.versions?.length) return false;
    return isDisplayableVersion(getSelectedVersion(record));
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
        const translation = translations[i] ?? '';
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
            const translation = String(segment.translation ?? segment.text ?? '').trim();
            return {
                id: Number(segment.id) || originalSegments[index]?.id || index + 1,
                source,
                translation,
            };
        });
    }
    return alignSegmentsFromText(originalText, version?.text ?? version ?? '');
}

function renderCompareHtml(originalText, version, messageId) {
    const segments = normalizeVersionSegments(version, originalText);
    let html = '<div class="stft-render stft-compare-render">';
    html += renderInlineToggleButton(messageId, true);
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
    return `<div class="stft-render stft-replace-render">${renderInlineToggleButton(messageId, true)}${renderMarkdown(translatedText, messageId)}</div>`;
}

function renderInlineToggleButton(messageId, visible = false) {
    const label = visible ? '取消译文' : '显示译文';
    const title = visible ? '取消当前楼层译文显示' : '显示这个回复已保存的译文';
    return `<button type="button" class="${INLINE_TOGGLE_CLASS}${visible ? ' stft-inline-toggle-visible' : ''}" data-stft-inline-toggle data-message-id="${escapeHtml(messageId)}" title="${escapeHtml(title)}">
        <i class="fa-solid fa-language"></i><span>${label}</span>
    </button>`;
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
    if (version.sourceHash && version.sourceHash !== hashText(message.mes || '')) {
        updateMessageRecord(messageId, nextRecord => {
            nextRecord.visible = false;
        });
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
        const record = loadStore().messages[getMessageRecordKey(messageId)];
        const hasTranslation = hasDisplayableVersion(record);
        const originalHtml = `${hasTranslation ? renderInlineToggleButton(messageId, false) : ''}${renderMarkdown(message.mes, messageId)}`;
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
    const recordKey = getMessageRecordKey(messageId);
    const record = store.messages[recordKey];
    const hasTranslation = hasDisplayableVersion(record);
    const visible = Boolean(record?.visible && hasTranslation);
    const loading = inFlight.has(recordKey);
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
        pruneMissingRecords();
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
    $('#chat .mes').each((_, element) => {
        const $mes = $(element);
        const messageId = String($mes.attr('mesid'));
        const record = loadStore().messages[getMessageRecordKey(messageId)];
        if (record?.visible && getSelectedVersion(record)) {
            applyDisplay(messageId);
        } else {
            if (hasDisplayableVersion(record) || $mes.find(`.mes_text .stft-render, .mes_text .${INLINE_TOGGLE_CLASS}`).length) {
                restoreDisplay(messageId, false);
            }
            updateButtonState($mes);
        }
    });
}

function resolveTargetLanguage(localValue = null, customValue = null) {
    const selected = localValue ?? settings.targetLanguage;
    if (selected === 'custom') {
        return String(customValue ?? settings.customTargetLanguage ?? '').trim() || '目标语言';
    }
    return selected;
}

function getLanguagePromptName(value) {
    return languagePromptNames[value] || String(value || '').trim() || '目标语言';
}

function isAiChannel() {
    return settings.translationChannel === translationChannels.ai;
}

function getChannelName(channel = settings.translationChannel) {
    if (channel === translationChannels.google) return 'Google 快速翻译';
    if (channel === translationChannels.microsoft) return 'Microsoft Translator';
    return 'AI 副 API';
}

function getMachineLanguageCode(language, channel = settings.translationChannel) {
    const value = String(language || '').trim();
    if (!value || value === 'auto') return 'auto';
    if (value === 'custom') {
        return String(settings.customTargetLanguage || '').trim();
    }
    const map = channel === translationChannels.microsoft ? microsoftLanguageCodes : googleLanguageCodes;
    const lower = value.toLowerCase();
    if (/简体|簡体|中文|汉语|漢語|chinese|zh-cn|zh-hans/.test(lower)) {
        return channel === translationChannels.microsoft ? 'zh-Hans' : 'zh-CN';
    }
    if (/繁体|繁體|zh-tw|zh-hant/.test(lower)) {
        return channel === translationChannels.microsoft ? 'zh-Hant' : 'zh-TW';
    }
    return map[value] || value;
}

function decodeHtmlEntities(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = String(value ?? '');
    return textarea.value;
}

function getPromptById(id) {
    return settings.prompts.find(prompt => prompt.id === id) || settings.prompts[0] || defaultPrompts[0];
}

function replacePromptVars(text, language, sourceLanguage) {
    return String(text ?? '')
        .replace(/\{\{target_language\}\}/g, language)
        .replace(/\{\{source_language\}\}/g, sourceLanguage || '自动识别');
}

function buildMessages(sourceText, language, presetId, sourceSegments = getSourceSegments(sourceText), forceTranslate = false) {
    const sourceLanguage = settings.sourceLanguage === 'auto' ? '自动识别' : getLanguagePromptName(settings.sourceLanguage);
    const targetLanguage = getLanguagePromptName(language);
    const prompt = getPromptById(presetId);
    const payload = {
        source_language: sourceLanguage,
        target_language: targetLanguage,
        rules: [
            `目标语言是：${targetLanguage}。`,
            'source_language 为“自动识别”时表示你要自己判断原文语言，不表示可以复制原文。',
            `如果正文不是${targetLanguage}，必须翻译成${targetLanguage}，禁止把原文照抄到 translation。`,
            '只翻译正文，不翻译思维链、推理过程、system/developer/tool 内容或任何解释文字。',
            '不要输出思考过程，不要添加注释，不要使用 Markdown 代码块。',
            '保持 segments 数组长度、顺序和 id 完全一致。',
            '每个返回对象只允许包含 id 和 translation，不要返回 source_text、text、source 或原始字段。',
            'translation 必须是 source_text 的译文，不是对 source_text 的复制。',
            `只有某段本来就已经是${targetLanguage}，或者它只是专名、代码、标记、章节编号等不应翻译内容时，才可以原样复制。`,
            forceTranslate ? `上一轮返回疑似照抄原文。请重新翻译，普通叙事和对话必须变成${targetLanguage}。` : '',
        ].filter(Boolean),
        segments: sourceSegments.map(segment => ({
            id: segment.id,
            source_text: segment.source,
        })),
    };
    return [
        {
            role: 'system',
            content: [
                replacePromptVars(prompt.text, targetLanguage, sourceLanguage),
                `最终目标语言：${targetLanguage}。如果输入不是${targetLanguage}，必须翻译，不要照抄原文。`,
            ].join('\n'),
        },
        {
            role: 'user',
            content: [
                '下面是需要翻译的正文段落。请严格按 JSON 返回，禁止输出 JSON 以外的任何内容。',
                '返回格式必须是：{"segments":[{"id":1,"translation":"..."}]}',
                'translation 里可以包含换行，但不要新增、删除或合并段落 id；不要把 source_text 原样放进 translation。',
                `目标语言再次确认：${targetLanguage}。`,
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
        const rawTranslation = pickTranslationText(item, sourceSegment.source);
        const translation = String(rawTranslation ?? '').trim();
        return {
            id: sourceSegment.id,
            source: sourceSegment.source,
            translation,
        };
    });
}

function pickTranslationText(item, sourceText) {
    const direct = item?.translation
        ?? item?.translated_text
        ?? item?.translatedText
        ?? item?.translated
        ?? item?.target
        ?? item?.target_text
        ?? item?.targetText
        ?? item?.output
        ?? item?.result
        ?? item?.译文;

    if (direct !== undefined && direct !== null) {
        return direct;
    }

    // Some small models return { id, text } for the translated text. Only accept
    // it when it is not just the input segment echoed back.
    const text = item?.text ?? item?.content;
    if (text !== undefined && !isSameText(text, sourceText)) {
        return text;
    }

    return '';
}

function normalizeComparableText(text) {
    return String(text ?? '').replace(/\s+/g, '').trim();
}

function isSameText(a, b) {
    return normalizeComparableText(a) === normalizeComparableText(b);
}

function hasLatinText(text) {
    return /[A-Za-z]{3,}/.test(String(text ?? ''));
}

function hasCjkText(text) {
    return /[\u3400-\u9FFF]/.test(String(text ?? ''));
}

function hasKanaText(text) {
    return /[\u3040-\u30FF]/.test(String(text ?? ''));
}

function hasHangulText(text) {
    return /[\uAC00-\uD7AF]/.test(String(text ?? ''));
}

function isChineseTarget(language) {
    const value = String(language ?? '').toLowerCase();
    return value.includes('chinese') || value.includes('中文') || value.includes('汉语') || value.includes('簡體') || value.includes('繁体') || value.includes('簡体');
}

function shouldTranslateSegment(source, targetLanguage) {
    if (isChineseTarget(targetLanguage)) {
        return (hasLatinText(source) && !hasCjkText(source)) || hasKanaText(source) || hasHangulText(source);
    }
    return false;
}

function isProbablyUntranslated(segments, targetLanguage) {
    const candidates = segments.filter(segment => shouldTranslateSegment(segment.source, targetLanguage));
    if (!candidates.length) return false;
    const unchanged = candidates.filter(segment => isSameText(segment.source, segment.translation)).length;
    return unchanged / candidates.length >= 0.5;
}

function parseTranslationResponse(rawText, sourceText, targetLanguage) {
    const sourceSegments = getSourceSegments(sourceText);
    const parsed = parseJsonLoose(rawText);
    const jsonSegments = parsed ? normalizeReturnedSegments(parsed, sourceSegments) : null;
    const segments = jsonSegments?.length ? jsonSegments : alignSegmentsFromText(sourceText, rawText);
    const text = segments.map(segment => segment.translation || '').filter(Boolean).join('\n\n').trim();
    const missingTranslationCount = segments.filter(segment => !String(segment.translation ?? '').trim()).length;
    return {
        text,
        segments,
        raw: String(rawText ?? '').trim(),
        usedFallback: !jsonSegments?.length,
        looksUntranslated: isProbablyUntranslated(segments, targetLanguage),
        missingTranslationCount,
    };
}

function normalizeEndpoint(endpoint) {
    const trimmed = String(endpoint || '').trim().replace(/\/+$/, '');
    if (!trimmed) return '';
    if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
    return `${trimmed}/chat/completions`;
}

function normalizeBaseEndpoint(endpoint) {
    return String(endpoint || '')
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/chat\/completions$/i, '');
}

function buildHeaders(mode = settings.requestMode) {
    const simpleMode = mode === requestModes.simple;
    const headers = simpleMode ? { 'Content-Type': 'text/plain' } : { 'Content-Type': 'application/json' };
    const key = String(settings.apiKey || '').trim();
    if (simpleMode || !key || settings.authMode === authModes.none) return headers;

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

function yamlLine(key, value) {
    return `${String(key).replace(/[\r\n:]/g, '').trim()}: ${JSON.stringify(String(value ?? ''))}`;
}

function buildTavernBackendHeaders() {
    const headers = {};
    const key = String(settings.apiKey || '').trim();
    if (!key || settings.authMode === authModes.none) return '';

    if (key && settings.authMode === authModes.bearer) {
        headers.Authorization = `Bearer ${key}`;
    } else if (key && settings.authMode === authModes.xApiKey) {
        headers['x-api-key'] = key;
    } else if (key && settings.authMode === authModes.custom) {
        const headerName = String(settings.customAuthHeader || '').trim() || 'Authorization';
        headers[headerName] = key;
    }

    return Object.entries(headers)
        .filter(([name, value]) => name.trim() && String(value ?? '').trim())
        .map(([name, value]) => yamlLine(name, value))
        .join('\n');
}

async function requestViaTavernBackend(endpoint, body) {
    const baseEndpoint = normalizeBaseEndpoint(endpoint || settings.endpoint);
    if (!baseEndpoint) throw new Error('请先在扩展设置里填写副 API / 反代地址。');

    const payload = {
        stream: false,
        messages: body.messages,
        model: body.model,
        chat_completion_source: 'custom',
        custom_url: baseEndpoint,
        custom_include_headers: buildTavernBackendHeaders(),
        temperature: body.temperature,
        max_tokens: body.max_tokens,
    };

    Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
            delete payload[key];
        }
    });

    try {
        return await fetch('/api/backends/chat-completions/generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            cache: 'no-cache',
            body: JSON.stringify(payload),
        });
    } catch (error) {
        const message = error?.message || String(error);
        throw new Error(`请求没有发到酒馆内置生成通道：${message}。这是扩展调用酒馆已有接口，不需要额外后端插件；如果这里失败，请检查酒馆登录/CSRF 状态。`);
    }
}

function directFetchErrorMessage(error, endpoint) {
    const message = error?.message || String(error);
    const endpointText = endpoint ? `地址：${endpoint}。` : '';
    if (settings.requestMode === requestModes.simple) {
        return `请求没有发到翻译 API：${message}。${endpointText}当前是“直连兼容模式”；如果仍失败，基本就是目标 API 没允许这个酒馆页面跨域访问，纯前端扩展无法绕过，需要 API/反代返回 CORS 头。`;
    }
    return `请求没有发到翻译 API：${message}。${endpointText}这通常是 CORS 预检、浏览器私有网络限制、端口不可达或手机访问的地址不对。你可以先试“直连兼容模式”，但如果 API 没开 CORS，纯前端扩展无法强行读取响应。`;
}

function compactHttpError(raw, fallback = '请求失败') {
    const value = String(raw || fallback || '').trim();
    if (!value) return fallback;
    if (/^\s*<!doctype html|<html[\s>]/i.test(value)) {
        return '服务器返回 HTML 错误页，通常是网页翻译端点拒绝了这次请求、文本过长，或网络代理改写了请求。';
    }
    const text = value
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > 260 ? `${text.slice(0, 260)}...` : text;
}

async function requestDirectly(endpoint, body) {
    try {
        return await fetch(endpoint, {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify(body),
        });
    } catch (error) {
        throw new Error(directFetchErrorMessage(error, endpoint));
    }
}

function getMachineSourceCode(channel) {
    const source = getMachineLanguageCode(settings.sourceLanguage, channel);
    return source === 'auto' || !source ? 'auto' : source;
}

function getMachineTargetCode(language, channel) {
    const target = getMachineLanguageCode(language, channel);
    if (!target || target === 'auto') {
        throw new Error('机器翻译渠道需要明确的目标语言。请选择中文、英文等具体语言，或在自定义目标语言里填写语言代码。');
    }
    return target;
}

function splitMachineRequestChunks(text, maxLength = googleChunkLength) {
    let rest = String(text ?? '').trim();
    if (!rest || rest.length <= maxLength) return rest ? [rest] : [];

    const chunks = [];
    const sentenceMarks = ['\n', '。', '！', '？', '!', '?', '.', ';', '；', ',', '，', ' '];
    while (rest.length > maxLength) {
        let cut = -1;
        for (const mark of sentenceMarks) {
            const index = rest.lastIndexOf(mark, maxLength);
            if (index > cut) cut = index + mark.length;
        }
        if (cut < Math.floor(maxLength * 0.45)) cut = maxLength;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    if (rest) chunks.push(rest);
    return chunks.filter(Boolean);
}

async function translateWithGoogleWeb(text, targetLanguage) {
    const chunks = splitMachineRequestChunks(text);
    if (chunks.length > 1) {
        const translatedChunks = [];
        for (const chunk of chunks) {
            translatedChunks.push(await translateWithGoogleWeb(chunk, targetLanguage));
        }
        return translatedChunks.join('\n');
    }

    const target = getMachineTargetCode(targetLanguage, translationChannels.google);
    const source = getMachineSourceCode(translationChannels.google);
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', source);
    url.searchParams.set('tl', target);
    url.searchParams.set('dt', 't');
    url.searchParams.set('q', text);

    const response = await fetch(url.toString(), { method: 'GET', cache: 'no-cache' });
    const raw = await response.text();
    if (!response.ok) throw new Error(`Google 翻译 ${response.status}: ${compactHttpError(raw, response.statusText)}`);

    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        throw new Error('Google 翻译返回了无法解析的内容。');
    }

    const translated = Array.isArray(data?.[0])
        ? data[0].map(part => part?.[0] || '').join('')
        : '';
    if (!translated.trim()) throw new Error('Google 翻译没有返回译文。');
    return decodeHtmlEntities(translated.trim());
}

function getMicrosoftTranslateUrl() {
    const base = String(settings.microsoftEndpoint || 'https://api.cognitive.microsofttranslator.com').trim().replace(/\/+$/, '');
    if (!base) throw new Error('请填写 Microsoft Translator Endpoint。');
    if (/\/translate$/i.test(base)) return base;
    if (/\.cognitiveservices\.azure\.com/i.test(base) && !/\/translator\/text\/v3\.0$/i.test(base)) {
        return `${base}/translator/text/v3.0/translate`;
    }
    if (/\/translator\/text\/v3\.0$/i.test(base)) {
        return `${base}/translate`;
    }
    return `${base}/translate`;
}

async function translateWithMicrosoft(text, targetLanguage) {
    const key = String(settings.microsoftKey || '').trim();
    if (!key) throw new Error('请先填写 Microsoft Translator Key。');

    const target = getMachineTargetCode(targetLanguage, translationChannels.microsoft);
    const source = getMachineSourceCode(translationChannels.microsoft);
    const url = new URL(getMicrosoftTranslateUrl());
    url.searchParams.set('api-version', '3.0');
    url.searchParams.set('to', target);
    if (source !== 'auto') url.searchParams.set('from', source);

    const headers = {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': key,
    };
    const region = String(settings.microsoftRegion || '').trim();
    if (region) headers['Ocp-Apim-Subscription-Region'] = region;

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers,
        body: JSON.stringify([{ Text: text }]),
    });
    const raw = await response.text();
    let data = null;
    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        data = null;
    }
    if (!response.ok) {
        const message = compactHttpError(data?.error?.message || raw, response.statusText);
        throw new Error(`Microsoft 翻译 ${response.status}: ${message}`);
    }
    const translated = data?.[0]?.translations?.[0]?.text || '';
    if (!translated.trim()) throw new Error('Microsoft Translator 没有返回译文。');
    return decodeHtmlEntities(translated.trim());
}

async function requestMachineTranslationText(sourceText, options, onProgress) {
    const channel = options.channel || settings.translationChannel;
    const sourceSegments = getSourceSegments(sourceText);
    const resultSegments = sourceSegments.map(segment => ({
        id: segment.id,
        source: segment.source,
        translation: '',
    }));
    let completed = 0;
    let nextIndex = 0;
    const total = resultSegments.length;
    const translateOne = channel === translationChannels.microsoft ? translateWithMicrosoft : translateWithGoogleWeb;

    const emitProgress = () => {
        const text = resultSegments.map(segment => segment.translation || '').filter(Boolean).join('\n\n').trim();
        onProgress?.({
            text,
            segments: resultSegments.map(segment => ({ ...segment })),
            completed,
            total,
            channel,
        });
    };

    const worker = async () => {
        while (nextIndex < total) {
            const index = nextIndex;
            nextIndex += 1;
            const segment = resultSegments[index];
            segment.translation = await translateOne(segment.source, options.language);
            completed += 1;
            emitProgress();
        }
    };

    const workers = Array.from({ length: Math.min(machineConcurrency, Math.max(total, 1)) }, () => worker());
    await Promise.all(workers);
    const text = resultSegments.map(segment => segment.translation || '').filter(Boolean).join('\n\n').trim();
    if (!text) throw new Error(`${getChannelName(channel)} 没有生成译文。`);
    return {
        text,
        segments: resultSegments,
        raw: text,
        usedFallback: false,
        looksUntranslated: isProbablyUntranslated(resultSegments, options.language),
    };
}

async function requestTranslationText(sourceText, options) {
    const endpoint = normalizeEndpoint(settings.endpoint);
    if (!endpoint) throw new Error('请先在扩展设置里填写副 API / 反代地址。');
    if (!settings.model) throw new Error('请先填写翻译模型名。');
    const sourceSegments = getSourceSegments(sourceText);

    const buildBody = (forceTranslate = false) => {
        const body = {
            model: settings.model,
            messages: buildMessages(sourceText, options.language, options.presetId, sourceSegments, forceTranslate),
            temperature: Number(settings.temperature) || 0,
            stream: false,
        };
        const maxTokens = Number(settings.maxTokens);
        if (Number.isFinite(maxTokens) && maxTokens > 0) {
            body.max_tokens = maxTokens;
        }
        return body;
    };

    const sendAndParse = async (forceTranslate = false) => {
        const body = buildBody(forceTranslate);
        const response = settings.requestMode === requestModes.tavern
            ? await requestViaTavernBackend(endpoint, body)
            : await requestDirectly(endpoint, body);

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
        if (data?.error) {
            const messageText = data?.error?.message || data?.error || text || '未知错误';
            throw new Error(`API 返回错误：${messageText}`);
        }

        const translated = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
        if (!String(translated).trim()) {
            throw new Error('API 返回成功，但没有找到译文内容。');
        }
        return parseTranslationResponse(translated, sourceText, options.language);
    };

    let result = await sendAndParse(false);
    if (result.looksUntranslated || result.missingTranslationCount) {
        result = await sendAndParse(true);
        result.retriedForCopy = true;
        if (result.missingTranslationCount) {
            throw new Error('API 返回内容里没有拿到有效 translation 字段，已拦截保存，避免把原文当译文显示。请点“刷新翻译”重试一次，或把提示词预设改回内置预设。');
        }
        if (result.looksUntranslated) {
            throw new Error('模型返回的译文仍然基本等于原文，已拦截保存。请确认目标语言是中文，并把提示词预设改回内置预设后刷新翻译。');
        }
    }
    return result;
}

async function requestTranslation(messageId, options, sourceText = getMessageSourceText(messageId)) {
    if (!sourceText) throw new Error('这个楼层没有可翻译正文。');
    return requestTranslationText(sourceText, options);
}

async function translateMessage(messageId, options = {}) {
    const recordKey = getMessageRecordKey(messageId);
    const sourceText = getMessageSourceText(messageId);
    const channel = settings.translationChannel || translationChannels.ai;
    const channelName = getChannelName(channel);
    if (inFlight.has(recordKey)) return;

    const localOptions = {
        language: options.language || resolveTargetLanguage(),
        presetId: options.presetId || settings.activePresetId,
        displayMode: options.displayMode || settings.displayMode,
        autoShow: options.autoShow ?? settings.autoShow,
        channel,
    };

    inFlight.set(recordKey, true);
    updateMessageRecord(messageId, record => {
        record.status = 'loading';
        record.statusText = channel === translationChannels.ai ? '正在请求翻译 API，等待模型返回...' : `正在使用${channelName}快速翻译...`;
        record.language = localOptions.language;
        record.presetId = localOptions.presetId;
        record.displayMode = localOptions.displayMode;
    }, recordKey);
    updateButtonState(getMessageElement(messageId));
    refreshModalIfOpen(messageId);

    try {
        if (channel !== translationChannels.ai) {
            const versionId = makeId('ver');
            const sourceSegments = getSourceSegments(sourceText);
            const version = {
                id: versionId,
                text: '',
                segments: sourceSegments.map(segment => ({ ...segment, translation: '' })),
                usedFallback: false,
                language: localOptions.language,
                presetId: channel,
                presetName: channelName,
                provider: channel,
                displayMode: localOptions.displayMode,
                createdAt: new Date().toISOString(),
                sourceHash: hashText(sourceText),
            };

            updateMessageRecord(messageId, record => {
                record.status = 'loading';
                record.statusText = `正在使用${channelName}快速翻译 0/${sourceSegments.length}...`;
                record.versions.push(version);
                record.selectedId = version.id;
                record.visible = Boolean(localOptions.autoShow);
                record.displayMode = localOptions.displayMode;
            }, recordKey);

            if (localOptions.autoShow && getMessageRecordKey(messageId) === recordKey) applyDisplay(messageId);

            const result = await requestMachineTranslationText(sourceText, localOptions, progress => {
                const statusText = `${channelName} 已翻译 ${progress.completed}/${progress.total} 段...`;
                updateMessageRecord(messageId, record => {
                    const target = record.versions.find(item => item.id === versionId);
                    if (target) {
                        target.text = progress.text;
                        target.segments = progress.segments;
                    }
                    record.status = 'loading';
                    record.statusText = statusText;
                    record.selectedId = versionId;
                    record.visible = Boolean(localOptions.autoShow);
                }, recordKey);
                if (localOptions.autoShow && getMessageRecordKey(messageId) === recordKey) applyDisplay(messageId);
                const $modal = $(`#${MODAL_ID}`);
                if ($modal.length && String($modal.data('message-id')) === String(messageId)) {
                    $('#stft_modal_status').text(statusText);
                }
            });

            if (result.looksUntranslated) {
                updateMessageRecord(messageId, record => {
                    record.visible = false;
                    record.status = 'error';
                    record.statusText = `${channelName} 返回的译文疑似仍是原文，已停止显示。`;
                }, recordKey);
                if (getMessageRecordKey(messageId) === recordKey) restoreDisplay(messageId, false);
                throw new Error(`${channelName} 返回的译文疑似仍是原文，已停止显示。请确认目标语言设置。`);
            }

            updateMessageRecord(messageId, record => {
                const target = record.versions.find(item => item.id === versionId);
                if (target) {
                    target.text = result.text;
                    target.segments = result.segments;
                    target.usedFallback = false;
                }
                record.status = 'success';
                record.statusText = `${channelName} 翻译完成。`;
                record.selectedId = versionId;
                record.visible = Boolean(localOptions.autoShow);
                record.displayMode = localOptions.displayMode;
            }, recordKey);

            if (getMessageRecordKey(messageId) === recordKey) {
                if (localOptions.autoShow) applyDisplay(messageId);
                else restoreDisplay(messageId, false);
            } else {
                updateButtonState(getMessageElement(messageId));
            }
            refreshModalIfOpen(messageId);
            toastr?.success?.(`${channelName} 翻译完成。`);
            return;
        }

        const result = await requestTranslation(messageId, localOptions, sourceText);
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
            sourceHash: hashText(sourceText),
        };

        updateMessageRecord(messageId, record => {
            record.status = 'success';
            record.statusText = result.retriedForCopy
                ? '翻译完成。第一次返回疑似照抄原文，已自动重试并保存第二次译文。'
                : result.usedFallback
                    ? '翻译完成，但模型没有按 JSON 返回，已按段落尽量匹配。'
                    : '翻译完成。';
            record.versions.push(version);
            record.selectedId = version.id;
            record.visible = Boolean(localOptions.autoShow);
            record.displayMode = localOptions.displayMode;
        }, recordKey);

        if (getMessageRecordKey(messageId) === recordKey) {
            if (localOptions.autoShow) applyDisplay(messageId);
            else restoreDisplay(messageId, false);
        } else {
            updateButtonState(getMessageElement(messageId));
        }
        refreshModalIfOpen(messageId);
        toastr?.success?.('楼层翻译完成。');
    } catch (error) {
        updateMessageRecord(messageId, record => {
            record.status = 'error';
            record.statusText = error?.message || String(error);
        }, recordKey);
        updateButtonState(getMessageElement(messageId));
        refreshModalIfOpen(messageId);
        toastr?.error?.(error?.message || String(error), '楼层翻译失败');
    } finally {
        inFlight.delete(recordKey);
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
                        <label class="stft-span-2">翻译渠道
                            <select id="stft_translation_channel" class="text_pole">
                                <option value="${translationChannels.ai}"${settings.translationChannel === translationChannels.ai ? ' selected' : ''}>AI 副 API</option>
                                <option value="${translationChannels.google}"${settings.translationChannel === translationChannels.google ? ' selected' : ''}>Google 快速翻译（免密）</option>
                                <option value="${translationChannels.microsoft}"${settings.translationChannel === translationChannels.microsoft ? ' selected' : ''}>Microsoft Translator</option>
                            </select>
                        </label>
                        <label class="stft-span-2 stft-ai-setting">副 API / 反代地址
                            <input id="stft_endpoint" class="text_pole" placeholder="https://example.com/v1" value="${escapeHtml(settings.endpoint)}">
                        </label>
                        <label class="stft-ai-setting">模型
                            <input id="stft_model" class="text_pole" placeholder="gpt-4o-mini" value="${escapeHtml(settings.model)}">
                        </label>
                        <label class="stft-ai-setting">温度
                            <input id="stft_temperature" class="text_pole" type="number" step="0.1" min="0" max="2" value="${escapeHtml(settings.temperature)}">
                        </label>
                        <label class="stft-ai-setting">API Key / 反代密码
                            <input id="stft_api_key" class="text_pole" type="password" autocomplete="off" value="${escapeHtml(settings.apiKey)}">
                        </label>
                        <label class="stft-ai-setting">鉴权方式
                            <select id="stft_auth_mode" class="text_pole">
                                <option value="${authModes.bearer}"${settings.authMode === authModes.bearer ? ' selected' : ''}>Authorization: Bearer</option>
                                <option value="${authModes.xApiKey}"${settings.authMode === authModes.xApiKey ? ' selected' : ''}>x-api-key</option>
                                <option value="${authModes.custom}"${settings.authMode === authModes.custom ? ' selected' : ''}>自定义请求头</option>
                                <option value="${authModes.none}"${settings.authMode === authModes.none ? ' selected' : ''}>不发送密码</option>
                            </select>
                        </label>
                        <label class="stft-ai-setting">请求方式
                            <select id="stft_request_mode" class="text_pole">
                                <option value="${requestModes.tavern}"${settings.requestMode === requestModes.tavern ? ' selected' : ''}>酒馆内置通道（推荐，无 CORS）</option>
                                <option value="${requestModes.standard}"${settings.requestMode === requestModes.standard ? ' selected' : ''}>前端直连：标准 JSON</option>
                                <option value="${requestModes.simple}"${settings.requestMode === requestModes.simple ? ' selected' : ''}>前端直连：兼容模式</option>
                            </select>
                        </label>
                        <label id="stft_custom_header_label" class="stft-ai-setting">自定义请求头名
                            <input id="stft_custom_header" class="text_pole" value="${escapeHtml(settings.customAuthHeader)}">
                        </label>
                        <label class="stft-ai-setting">最大输出 tokens
                            <input id="stft_max_tokens" class="text_pole" type="number" min="0" step="1" value="${escapeHtml(settings.maxTokens)}">
                        </label>
                        <label class="stft-span-2 stft-microsoft-setting">Microsoft Translator Endpoint
                            <input id="stft_microsoft_endpoint" class="text_pole" placeholder="https://api.cognitive.microsofttranslator.com" value="${escapeHtml(settings.microsoftEndpoint)}">
                        </label>
                        <label class="stft-microsoft-setting">Microsoft Key
                            <input id="stft_microsoft_key" class="text_pole" type="password" autocomplete="off" value="${escapeHtml(settings.microsoftKey)}">
                        </label>
                        <label class="stft-microsoft-setting">Microsoft Region
                            <input id="stft_microsoft_region" class="text_pole" placeholder="可留空，区域资源才填写" value="${escapeHtml(settings.microsoftRegion)}">
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
                        <label class="stft-ai-setting">默认提示词预设
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
                        <label class="checkbox_label stft-span-2" title="只在本扩展运行时拦截 message_swiped，不修改酒馆本体文件，也不保存改动到酒馆自带翻译设置。">
                            <input id="stft_suppress_builtin_swipe_translate" type="checkbox"${settings.suppressBuiltinSwipeTranslate ? ' checked' : ''}>
                            防止酒馆自带翻译在切换候选回复时自动触发
                        </label>
                        <label class="stft-span-2 stft-ai-setting">当前预设名称
                            <input id="stft_prompt_name" class="text_pole" value="${escapeHtml(prompt.name)}">
                        </label>
                        <label class="stft-span-2 stft-ai-setting">提示词内容
                            <textarea id="stft_prompt_text" class="text_pole" spellcheck="false">${escapeHtml(prompt.text)}</textarea>
                        </label>
                    </div>
                    <div class="stft-row marginTop10">
                        <div id="stft_prompt_save" class="menu_button stft-ai-setting">保存预设</div>
                        <div id="stft_prompt_new" class="menu_button stft-ai-setting"><i class="fa-solid fa-plus"></i><span>新建</span></div>
                        <div id="stft_prompt_delete" class="menu_button stft-ai-setting"><i class="fa-solid fa-trash-can"></i><span>删除</span></div>
                        <div id="stft_test_api" class="menu_button"><i class="fa-solid fa-plug"></i><span>测试 API</span></div>
                    </div>
                    <div id="stft_global_status" class="stft-status stft-muted marginTop10">
                        副 API 独立于酒馆主 API。推荐使用酒馆内置通道：不改酒馆本体，只调用酒馆已有生成接口。
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

    $('#stft_translation_channel').on('change', event => {
        setAndSave('translationChannel', event.target.value);
        refreshConditionalSettings();
    });
    $('#stft_endpoint').on('input', event => setAndSave('endpoint', event.target.value.trim()));
    $('#stft_model').on('input', event => {
        setAndSave('model', event.target.value.trim());
        refreshConditionalSettings();
    });
    $('#stft_api_key').on('input', event => setAndSave('apiKey', event.target.value));
    $('#stft_auth_mode').on('change', event => {
        setAndSave('authMode', event.target.value);
        refreshConditionalSettings();
    });
    $('#stft_request_mode').on('change', event => {
        setAndSave('requestMode', event.target.value);
        refreshConditionalSettings();
    });
    $('#stft_custom_header').on('input', event => setAndSave('customAuthHeader', event.target.value.trim()));
    $('#stft_microsoft_endpoint').on('input', event => setAndSave('microsoftEndpoint', event.target.value.trim()));
    $('#stft_microsoft_key').on('input', event => setAndSave('microsoftKey', event.target.value));
    $('#stft_microsoft_region').on('input', event => setAndSave('microsoftRegion', event.target.value.trim()));
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
    $('#stft_suppress_builtin_swipe_translate').on('change', event => {
        setAndSave('suppressBuiltinSwipeTranslate', event.target.checked);
        refreshConditionalSettings();
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
    const simpleMode = settings.requestMode === requestModes.simple;
    const aiChannel = settings.translationChannel === translationChannels.ai;
    const microsoftChannel = settings.translationChannel === translationChannels.microsoft;
    $('.stft-ai-setting').toggle(aiChannel);
    $('.stft-microsoft-setting').toggle(microsoftChannel);
    $('#stft_custom_header_label').toggle(aiChannel && settings.authMode === authModes.custom && !simpleMode);
    $('#stft_api_key').closest('label').toggle(aiChannel && !simpleMode);
    $('#stft_auth_mode').closest('label').toggle(aiChannel && !simpleMode);
    $('#stft_custom_language_label').toggle(settings.targetLanguage === 'custom');
    if ($('#stft_global_status').length) {
        const statusText = aiChannel
            ? '副 API 独立于酒馆主 API。推荐使用酒馆内置通道：不改酒馆本体，只调用酒馆已有生成接口。'
            : microsoftChannel
                ? 'Microsoft Translator 为快速机器翻译渠道，按段落并发请求，边返回边显示；需要填写 Key，区域资源再填写 Region。'
                : 'Google 快速翻译为免密机器翻译渠道，按段落并发请求，边返回边显示；如果浏览器或网络拦截，会在楼层状态里报错。';
        const builtinMode = extension_settings.translate?.auto_mode;
        const guardText = settings.suppressBuiltinSwipeTranslate && builtinTranslateIncomingModes.has(builtinMode)
            ? ' 已拦截酒馆自带翻译的切换候选回复自动触发，避免未点击本扩展也出现 Google 红字。'
            : settings.suppressBuiltinSwipeTranslate
                ? ' 切换候选回复防红字已开启。'
                : ' 切换候选回复防红字已关闭。';
        $('#stft_global_status').text(`${statusText}${guardText}`);
    }
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
        text: '请把正文翻译成{{target_language}}，语气自然，忠实保留信息。如果正文不是{{target_language}}，必须翻译，不能照抄原文。只有已经是目标语言或不应翻译的片段请原样复制。',
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
    $('#stft_global_status').text(`正在测试${getChannelName()}...`);
    try {
        const sample = 'The rain had stopped, but the city still smelled like summer thunder.';
        const options = {
            language: resolveTargetLanguage(),
            presetId: settings.activePresetId,
            channel: settings.translationChannel,
        };
        const result = isAiChannel()
            ? await requestTranslationText(sample, options)
            : await requestMachineTranslationText(sample, options);
        $('#stft_global_status').text(`${getChannelName()}测试成功：${result.text.slice(0, 120)}`);
    } catch (error) {
        $('#stft_global_status').text(`${getChannelName()}测试失败：${error.message}`);
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
    const replyLabel = getReplyLabel(messageId);
    const titleSuffix = replyLabel ? ` · ${replyLabel}` : '';
    const channelName = getChannelName();
    const aiChannel = settings.translationChannel === translationChannels.ai;

    return `
        <div id="${MODAL_ID}" data-message-id="${escapeHtml(messageId)}">
            <div class="stft-modal-card">
                <div class="stft-modal-head">
                    <div class="stft-modal-title">楼层译文 ${escapeHtml(floor)}${escapeHtml(titleSuffix)}</div>
                    <div class="menu_button menu_button_icon fa-solid fa-xmark" data-stft-close title="关闭"></div>
                </div>
                <div class="stft-modal-body">
                    <div class="stft-status" id="stft_modal_status">${escapeHtml(record.statusText || '未开始')}</div>
                    <div class="stft-muted">当前渠道：${escapeHtml(channelName)}</div>
                    <div class="stft-grid">
                        <label>目标语言
                            <select id="stft_modal_language" class="text_pole">${languageOptions(selectedLanguage)}</select>
                        </label>
                        <label id="stft_modal_custom_language_label">自定义目标语言
                            <input id="stft_modal_custom_language" class="text_pole" value="${escapeHtml(customLanguage)}">
                        </label>
                        ${aiChannel ? `<label>提示词预设
                            <select id="stft_modal_preset" class="text_pole">${promptOptions(record.presetId || settings.activePresetId)}</select>
                        </label>` : ''}
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
                            <i class="fa-solid fa-rotate"></i><span>${record.versions.length ? (aiChannel ? '刷新翻译' : '重新快速翻译') : (aiChannel ? '开始翻译' : '快速翻译')}</span>
                        </div>
                        <div id="stft_modal_toggle" class="menu_button">
                            <i class="fa-solid fa-language"></i><span>${record.visible ? '取消译文' : '显示译文'}</span>
                        </div>
                        <div id="stft_modal_delete_all" class="menu_button">
                            <i class="fa-solid fa-trash-can"></i><span>清空本回复译文</span>
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
        return '<div class="stft-empty">这个回复还没有保存的译文。点击“开始翻译”后，旧译文会留在这里供你切换、编辑或删除。</div>';
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
            record.statusText = '已清空本回复译文。';
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
    if (!isDisplayableVersion(selected)) {
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
    $(document).on('click.floorTranslator', `.${INLINE_TOGGLE_CLASS}`, function (event) {
        event.preventDefault();
        event.stopPropagation();
        const messageId = String($(this).data('message-id') || $(this).closest('.mes').attr('mesid'));
        toggleDisplay(messageId, false);
    });
}

function bindEvents() {
    const eventsToScan = [
        event_types.CHAT_CHANGED,
        event_types.CHARACTER_MESSAGE_RENDERED,
        event_types.USER_MESSAGE_RENDERED,
        event_types.GENERATION_ENDED,
        event_types.GENERATION_STOPPED,
    ];
    for (const eventName of eventsToScan) {
        eventSource.on(eventName, () => queueScan());
    }
    eventSource.on(event_types.MESSAGE_UPDATED, payload => {
        const messageId = getEventMessageId(payload);
        queueScan();
        refreshModalIfOpen(messageId);
    });
    eventSource.on(event_types.MESSAGE_SWIPED, payload => {
        const messageId = getEventMessageId(payload);
        queueScan();
        refreshModalIfOpen(messageId);
    });
    eventSource.on(event_types.MESSAGE_SWIPE_DELETED, payload => {
        const messageId = getEventMessageId(payload);
        pruneMissingRecords();
        queueScan();
        refreshModalIfOpen(messageId);
    });
    eventSource.on(event_types.MESSAGE_DELETED, () => {
        pruneMissingRecords();
        queueScan();
        const modalMessageId = $(`#${MODAL_ID}`).data('message-id');
        if (modalMessageId !== undefined && !getMessageData(modalMessageId)) {
            closeFloorModal();
        }
    });
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
        installBuiltinSwipeTranslateGuard();
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
