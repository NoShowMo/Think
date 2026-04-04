# Think Tags

A SillyTavern extension that extracts text wrapped in think tags (e.g. `<think>...</think>`) from AI responses and places it into the Reasoning box. The tagged content is removed from the visible message and chat history, so it only serves as reasoning context for that specific response.

## Installation

1. Open SillyTavern and go to **Extensions** > **Install Extension**
2. Paste this repository URL: `https://github.com/NoShowMo/Think`
3. Click **Install** and enable the extension

## Usage

Once enabled, any AI response containing text between the configured tags will automatically have that text:
- **Extracted** into the collapsible Reasoning box above the message
- **Stripped** from the message text and chat history

The reasoning content is display-only for that message and does not persist in the conversation context sent to the AI.

## Settings

In the **Extensions** panel, expand **Think Tags** to configure:

- **Enable/Disable** - Toggle the extraction on or off
- **Prefix** - The opening tag (default: `<think>`)
- **Suffix** - The closing tag (default: `</think>`)

You can change the prefix/suffix to match whatever tags your AI model uses for its thinking output.

## Example

**AI response:**
```
<think>The user is asking about quantum physics. I should explain it simply.</think>
Quantum physics is the study of matter and energy at the smallest scales.
```

**Result:**
- **Message:** "Quantum physics is the study of matter and energy at the smallest scales."
- **Reasoning box:** "The user is asking about quantum physics. I should explain it simply."
