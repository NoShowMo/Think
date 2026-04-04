/*
 * Think Tags - SillyTavern Extension
 * Extracts text within configurable tags (default: <think></think>)
 * and places it into the message's Reasoning box.
 */

const MODULE_NAME = 'Think';
const extensionFolderPath = 'scripts/extensions/third-party/Think';

const defaultSettings = Object.freeze({
    enabled: true,
    prefix: '<think>',
    suffix: '</think>',
});

/**
 * Extract think-tag content from message text using indexOf.
 * Handles multiple blocks, empty blocks, and unclosed tags gracefully.
 * Returns null if no blocks found.
 */
function extractThinkContent(text, prefix, suffix) {
    if (!prefix || !suffix || !text) return null;

    let reasoning = '';
    let cleanedText = text;
    let found = false;

    while (true) {
        const startIdx = cleanedText.indexOf(prefix);
        if (startIdx === -1) break;

        const contentStart = startIdx + prefix.length;
        const endIdx = cleanedText.indexOf(suffix, contentStart);
        if (endIdx === -1) break; // unclosed tag — leave it

        const blockContent = cleanedText.substring(contentStart, endIdx).trim();
        if (blockContent.length > 0) {
            reasoning += (reasoning ? '\n\n' : '') + blockContent;
        }

        cleanedText = cleanedText.substring(0, startIdx) + cleanedText.substring(endIdx + suffix.length);
        found = true;
    }

    if (!found) return null;

    return {
        reasoning: reasoning,
        cleanedText: cleanedText.trim(),
    };
}

/**
 * Handle incoming AI messages — extract think tags into reasoning.
 * Called on both MESSAGE_RECEIVED and CHARACTER_MESSAGE_RENDERED for robustness.
 */
function handleMessageReceived(messageIndex) {
    const context = SillyTavern.getContext();
    const settings = context.extensionSettings[MODULE_NAME];

    console.log('[ThinkTags] Handler fired, event arg:', messageIndex, 'type:', typeof messageIndex);

    if (!settings || !settings.enabled) {
        console.log('[ThinkTags] Extension disabled or no settings, skipping');
        return;
    }

    // Fall back to last message if index is invalid
    const chat = context.chat;
    const index = (typeof messageIndex === 'number' && chat[messageIndex]) ? messageIndex : chat.length - 1;
    const message = chat[index];

    console.log('[ThinkTags] Message index:', index, 'has message:', !!message);

    if (!message || !message.mes) {
        console.log('[ThinkTags] No message or empty mes, skipping');
        return;
    }

    // Skip if already processed by this extension
    if (message.extra?._thinkTagsProcessed) {
        console.log('[ThinkTags] Already processed, skipping');
        return;
    }

    console.log('[ThinkTags] message.mes (first 200 chars):', message.mes.substring(0, 200));
    console.log('[ThinkTags] Has existing reasoning:', !!message.extra?.reasoning);
    console.log('[ThinkTags] Looking for prefix:', JSON.stringify(settings.prefix), 'suffix:', JSON.stringify(settings.suffix));
    console.log('[ThinkTags] indexOf prefix in mes:', message.mes.indexOf(settings.prefix));

    // Try raw tags first
    let result = extractThinkContent(message.mes, settings.prefix, settings.suffix);
    console.log('[ThinkTags] Raw tag extraction:', result ? 'FOUND' : 'not found');

    // Try HTML-encoded variants as fallback
    if (!result) {
        const htmlPrefix = settings.prefix.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const htmlSuffix = settings.suffix.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (htmlPrefix !== settings.prefix) {
            console.log('[ThinkTags] Trying HTML-encoded:', JSON.stringify(htmlPrefix));
            console.log('[ThinkTags] indexOf html prefix:', message.mes.indexOf(htmlPrefix));
            result = extractThinkContent(message.mes, htmlPrefix, htmlSuffix);
            console.log('[ThinkTags] HTML extraction:', result ? 'FOUND' : 'not found');
        }
    }

    if (!result) {
        console.log('[ThinkTags] No think tags found, done');
        return;
    }

    if (!message.extra) {
        message.extra = {};
    }

    // Merge: append to existing reasoning (e.g. from API-native reasoning)
    if (message.extra.reasoning) {
        console.log('[ThinkTags] Appending to existing reasoning');
        message.extra.reasoning += '\n\n' + result.reasoning;
    } else {
        console.log('[ThinkTags] Setting new reasoning');
        message.extra.reasoning = result.reasoning;
    }

    message.mes = result.cleanedText;
    message.extra._thinkTagsProcessed = true;

    // Sync modified text to swipe data so it persists across swipe navigation
    if (Array.isArray(message.swipes) && message.swipes.length > 0) {
        message.swipes[message.swipe_id ?? 0] = message.mes;
    }

    // Update the DOM if the message is already rendered
    if (typeof context.updateMessageBlock === 'function') {
        console.log('[ThinkTags] Calling updateMessageBlock for index', index);
        context.updateMessageBlock(index, message);
    } else {
        console.log('[ThinkTags] WARNING: updateMessageBlock not available');
    }

    // Force save
    context.saveChatDebounced();
    console.log('[ThinkTags] SUCCESS - reasoning extracted and saved');
}

/**
 * Load settings from extension_settings, applying defaults for missing keys.
 */
function loadSettings() {
    const context = SillyTavern.getContext();
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    const settings = context.extensionSettings[MODULE_NAME];
    for (const key of Object.keys(defaultSettings)) {
        if (settings[key] === undefined) {
            settings[key] = defaultSettings[key];
        }
    }

    // Sync UI
    $('#think_enabled').prop('checked', settings.enabled);
    $('#think_prefix').val(settings.prefix);
    $('#think_suffix').val(settings.suffix);
}

function onEnabledChange(event) {
    const context = SillyTavern.getContext();
    context.extensionSettings[MODULE_NAME].enabled = Boolean($(event.target).prop('checked'));
    context.saveSettingsDebounced();
}

function onPrefixChange(event) {
    const context = SillyTavern.getContext();
    context.extensionSettings[MODULE_NAME].prefix = String($(event.target).val());
    context.saveSettingsDebounced();
}

function onSuffixChange(event) {
    const context = SillyTavern.getContext();
    context.extensionSettings[MODULE_NAME].suffix = String($(event.target).val());
    context.saveSettingsDebounced();
}

/**
 * Extension entry point.
 */
jQuery(async () => {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    $('#extensions_settings').append(settingsHtml);

    $('#think_enabled').on('input', onEnabledChange);
    $('#think_prefix').on('input', onPrefixChange);
    $('#think_suffix').on('input', onSuffixChange);

    loadSettings();

    const context = SillyTavern.getContext();

    console.log('[ThinkTags] Extension loaded');
    console.log('[ThinkTags] eventTypes:', !!context.eventTypes);
    console.log('[ThinkTags] MESSAGE_RECEIVED:', context.eventTypes?.MESSAGE_RECEIVED);
    console.log('[ThinkTags] CHARACTER_MESSAGE_RENDERED:', context.eventTypes?.CHARACTER_MESSAGE_RENDERED);

    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, handleMessageReceived);
    context.eventSource.on(context.eventTypes.CHARACTER_MESSAGE_RENDERED, handleMessageReceived);

    console.log('[ThinkTags] Event listeners registered');
});
