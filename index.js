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

    if (!settings || !settings.enabled) return;

    // Fall back to last message if index is invalid
    const chat = context.chat;
    const index = (typeof messageIndex === 'number' && chat[messageIndex]) ? messageIndex : chat.length - 1;
    const message = chat[index];
    if (!message || !message.mes) return;

    // Skip if already processed by this extension
    if (message.extra?._thinkTagsProcessed) return;

    // Try raw tags first
    let result = extractThinkContent(message.mes, settings.prefix, settings.suffix);

    // Try HTML-encoded variants as fallback
    if (!result) {
        const htmlPrefix = settings.prefix.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const htmlSuffix = settings.suffix.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (htmlPrefix !== settings.prefix) {
            result = extractThinkContent(message.mes, htmlPrefix, htmlSuffix);
        }
    }

    if (!result) return;

    if (!message.extra) {
        message.extra = {};
    }

    // Merge: append to existing reasoning (e.g. from API-native reasoning)
    if (message.extra.reasoning) {
        message.extra.reasoning += '\n\n' + result.reasoning;
    } else {
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
        context.updateMessageBlock(index, message);
    }

    // Force save since ST's built-in handler may have skipped saving
    context.saveChatDebounced();
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
    // Listen to both events for robustness — MESSAGE_RECEIVED fires first,
    // CHARACTER_MESSAGE_RENDERED fires after as a safety net in case
    // message text was re-synced between events.
    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, handleMessageReceived);
    context.eventSource.on(context.eventTypes.CHARACTER_MESSAGE_RENDERED, handleMessageReceived);
});
