/*
 * Think Tags - SillyTavern Extension
 * Extracts text within configurable tags (default: <think></think>)
 * and places it into the message's Reasoning box.
 */

const MODULE_NAME = 'Think';

const defaultSettings = Object.freeze({
    enabled: true,
    prefix: '<think>',
    suffix: '</think>',
});

const SETTINGS_HTML = `
<div class="think-settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Think Tags</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="flex-container">
                <input id="think_enabled" type="checkbox" />
                <label for="think_enabled">Enable Think tag extraction</label>
            </div>
            <label for="think_prefix">Prefix (opening tag)</label>
            <input id="think_prefix" type="text" class="text_pole" placeholder="<think>" />
            <label for="think_suffix">Suffix (closing tag)</label>
            <input id="think_suffix" type="text" class="text_pole" placeholder="</think>" />
            <small>
                Text wrapped between these tags in AI responses will be extracted
                into the Reasoning box and removed from the message.
            </small>
            <hr class="sysHR" />
        </div>
    </div>
</div>`;

/**
 * Extract think-tag content from message text using indexOf.
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
        if (endIdx === -1) break;

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
 */
function handleMessageReceived(messageIndex) {
    try {
        const context = SillyTavern.getContext();
        const settings = context.extensionSettings[MODULE_NAME];

        console.log('[ThinkTags] Handler fired, arg:', messageIndex, 'type:', typeof messageIndex);

        if (!settings || !settings.enabled) return;

        const chat = context.chat;
        const index = (typeof messageIndex === 'number' && chat[messageIndex]) ? messageIndex : chat.length - 1;
        const message = chat[index];

        if (!message || !message.mes) {
            console.log('[ThinkTags] No message or empty mes');
            return;
        }

        if (message.extra?._thinkTagsProcessed) {
            console.log('[ThinkTags] Already processed');
            return;
        }

        console.log('[ThinkTags] mes (first 200):', message.mes.substring(0, 200));
        console.log('[ThinkTags] indexOf prefix:', message.mes.indexOf(settings.prefix));

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

        if (!result) {
            console.log('[ThinkTags] No tags found');
            return;
        }

        if (!message.extra) {
            message.extra = {};
        }

        // Merge with existing reasoning
        if (message.extra.reasoning) {
            message.extra.reasoning += '\n\n' + result.reasoning;
        } else {
            message.extra.reasoning = result.reasoning;
        }

        message.mes = result.cleanedText;
        message.extra._thinkTagsProcessed = true;

        // Sync to swipe data
        if (Array.isArray(message.swipes) && message.swipes.length > 0) {
            message.swipes[message.swipe_id ?? 0] = message.mes;
        }

        // Update DOM
        if (typeof context.updateMessageBlock === 'function') {
            context.updateMessageBlock(index, message);
        }

        context.saveChatDebounced();
        console.log('[ThinkTags] SUCCESS — extracted reasoning, updated message');
    } catch (err) {
        console.error('[ThinkTags] Error in handler:', err);
    }
}

/**
 * Load settings, applying defaults for missing keys.
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
    return settings;
}

/**
 * Sync UI inputs with current settings values.
 */
function syncSettingsUI(settings) {
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
    try {
        console.log('[ThinkTags] Initializing...');

        const context = SillyTavern.getContext();

        // 1. Register event listeners FIRST — core functionality
        context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, handleMessageReceived);
        context.eventSource.on(context.eventTypes.CHARACTER_MESSAGE_RENDERED, handleMessageReceived);
        console.log('[ThinkTags] Event listeners registered');

        // 2. Load settings
        const settings = loadSettings();
        console.log('[ThinkTags] Settings loaded:', JSON.stringify(settings));

        // 3. Render settings UI (inline HTML — no external file dependency)
        $('#extensions_settings').append(SETTINGS_HTML);

        // 4. Bind UI events
        $('#think_enabled').on('input', onEnabledChange);
        $('#think_prefix').on('input', onPrefixChange);
        $('#think_suffix').on('input', onSuffixChange);

        // 5. Sync UI with settings
        syncSettingsUI(settings);

        console.log('[ThinkTags] Extension loaded successfully');
    } catch (err) {
        console.error('[ThinkTags] Failed to initialize:', err);
    }
});
