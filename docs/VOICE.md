# Voice capture workflow

Omni is built to pair with [Wispr Flow](https://wisprflow.ai) for
hands-free input. The goal: hold a hotkey, speak, release — the note is
saved or the question is answered without touching a keyboard.

## Setup

1. **Omni running** — `npm run dev`, keep the browser tab open.
2. **Wispr Flow installed** — configured to activate on `fn` hold.
3. **System hotkey to focus Omni** — `fn + Opt` brings the browser
   window / Omni tab to the foreground.

## The flow

```
fn + Opt (focus Omni window)
    │
    ▼
fn hold (Wispr Flow starts listening)
    │
    ▼
speak naturally — Wispr transcribes into the focused omni-bar
    │
    ▼
fn release (Wispr stops, text appears in the input field)
    │
    ▼
Enter (submit) — or configure Wispr to auto-submit on dictation stop
    │
    ▼
Omni processes: filter → classify → save or answer
```

The entire interaction — summon, speak, dismiss — should take under
five seconds for a save, and however long the model needs for a
question.

## macOS hotkey setup

### Option A — Shortcuts app (no install)

1. Open **Shortcuts.app**.
2. Create a new shortcut:
   - Action: **Run AppleScript**
   - Script:
     ```applescript
     tell application "System Events"
       set frontApp to name of first application process whose frontmost is true
     end tell
     tell application "Google Chrome"
       activate
       set found to false
       repeat with w in windows
         repeat with t in tabs of w
           if URL of t contains "localhost:3000" then
             set active tab index of w to index of t
             set index of w to 1
             set found to true
             exit repeat
           end if
         end repeat
         if found then exit repeat
       end repeat
     end tell
     ```
   - Adjust for your browser (Safari, Arc, etc.).
3. In **System Settings → Keyboard → Keyboard Shortcuts → App Shortcuts**,
   assign `fn + Opt` (or any free combo) to trigger the shortcut.

### Option B — Raycast / Alfred

If you already use Raycast or Alfred, create a script command that
activates the Omni tab. Same AppleScript logic, fewer steps.

### Option C — Tauri wrapper (stretch goal)

The roadmap's stretch phase wraps Omni in Tauri for a true system-wide
overlay (Spotlight-style). At that point the hotkey focuses a native
window instead of hunting for a browser tab.

## Wispr Flow settings

- **Activation**: `fn` hold (default).
- **Auto-submit**: If Wispr supports sending Enter on dictation stop,
  enable it — removes the last manual keystroke.
- **Dictation language**: Match your primary language.
- **Noise cancellation**: Keep on — Omni's pre-filter catches some
  transcription noise, but clean audio is better than filtering garbage.

## Why this matters

Apple's Siri requires "Hey Siri" or a button press, routes through
Apple's servers, and can't be extended with personal memory. This
workflow replaces that with:

- **Local-first** — nothing leaves your machine except the model API
  calls needed to classify and answer.
- **Extensible** — the intent classifier, recall logic, and providers
  are all in your codebase, not a black box.
- **Fast** — Wispr Flow's local transcription is faster than Siri's
  round-trip, and the pre-filter catches noise before any API call.
