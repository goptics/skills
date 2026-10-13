# Voice-over

Load in phase 4 when the user wants a voice. The voice speaks each scene's `say`; everything else (timing, captions, music, mixing) is shared by every voice and both renderers.

## Pick the provider (ask the user)

| Provider | What the user gets | Needs |
|---|---|---|
| `recorded` | Their own voice. The skill writes `SCRIPT.md` with time windows; they record one file per scene, or one track for the whole reel | a microphone; files in `reel/` (e.g. `rec/01.wav`) |
| `piper` | Free, offline neural text-to-speech | `pip install piper-tts` (or a venv) and one voice model (`.onnx` + `.onnx.json`) |
| `command` | Any TTS they already use (cloud voices such as ElevenLabs or OpenAI) through their own command | their CLI or script; its API key in **their** environment |
| `tone` | A soft beep as long as the text would take to say | nothing (ffmpeg). For checking pacing before a real voice exists |

`audio` in `scenes.json`, one of:

```jsonc
"audio": { "voice": { "provider": "recorded" } }                       // + "voice": "rec/01.wav" on each scene
"audio": { "voice": { "provider": "recorded", "file": "rec/full.wav" } } // one take for the whole reel; durations stay
"audio": { "voice": { "provider": "piper", "model": "voices/en_US-lessac-medium.onnx", "bin": ".venv/bin/piper" } }
"audio": { "voice": { "provider": "command", "command": "my-tts --out {out} --text-file {text_file}", "ext": "mp3" } }
"audio": { "voice": { "provider": "tone" } }
```

Optional, any provider: `"music": { "file": "music.mp3", "volume": 0.15, "duck": true }`, `"lead": 0.4` (seconds before the voice starts in a scene), `"tail": 0.9` (seconds kept after it ends).

- **Piper setup:** `python3 -m venv .venv && .venv/bin/pip install piper-tts`, then download one voice from the official list (huggingface.co/rhasspy/piper-voices), e.g. `en_US-lessac-medium.onnx` and its `.onnx.json`. Ask before downloading (~60 MB). `piper` options: `speaker` (multi-speaker voices), `rate` (> 1 slower).
- **Keep paths relative** to `reel/` (`voices/…`, `.venv/bin/piper`), or leave `bin` out when `piper` is on PATH, so the project rebuilds on another machine. If the model lives elsewhere, gitignore it and note in `assets/explainers/README.md` where to get it.
- **Command template:** placeholders `{out}` (the file to write, required), `{text_file}` (the text, UTF-8), `{text}`, `{index}`. Values are shell-quoted when substituted. Never put an API key in `scenes.json` or a command line; the user's tool reads it from their environment.

## What happens

1. `node render.mjs` (or `--at` for stills) runs the provider's check, then makes one clip per scene with `say` (or uses the recording). Clips are cached in `reel/vo/` by provider, options and text, so only changed lines are made again.
2. Each scene becomes `max(its duration, lead + clip + tail)` long. A line that doesn't fit stretches its scene; the next scenes move with it.
3. The voice is placed at each scene's start + `lead`, music under it (ducked about 12 dB while speaking), faded out at the end, and muxed into the MP4 as AAC.
4. `reel.srt` then carries the spoken words, split into caption-sized cues and timed across each clip. Without a per-scene voice it keeps each scene's `caption`.

`--no-voice` renders the silent version. `SCRIPT.md` (`--script`) uses the planned durations, which is what someone recording needs.

## Lining the diagram up with the words

A voice stretches scenes, so loop windows and timings move. After the first voiced build:

1. `node render.mjs --timeline`: fix every "wraps to the loop start" warning (longer calm tail in the generator, or a different `offset`).
2. Read `reel.srt` against the storyboard timeline: the diagram event a sentence talks about should happen while that sentence is spoken. Diagram time in a scene = scene time + `offset`; a negative `offset` holds the first frame so the diagram starts later.

## Writing for the ear

- About 2.5 words per second. A scene's `say` should fit its planned duration minus ~1.3 s; longer lines stretch the reel.
- Say identifiers the way people speak them ("Add", not "A-D-D"); backticks in `say` are dropped for captions.
- One idea per scene, the same idea as the caption, in more words. No claim in the voice that isn't in the storyboard.

## Check

- `ffprobe reel.mp4`: an `aac` audio stream, duration = the summed fitted scenes.
- Ask the user to listen once from start to end. If a line sounds wrong, change its `say` (or re-record that one file) and render again; the other clips come from the cache.
- Timing without ears: `ffmpeg -i reel.mp4 -af silencedetect=noise=-40dB:d=0.7 -f null -` lists the gaps between lines; each should straddle a scene boundary, with speech starting about `lead` seconds into the next scene.
- Open `reel.srt` next to the video: cues appear when the words are spoken.
