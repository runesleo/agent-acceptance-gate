# Demo Video Pipeline Truth - 2026-07-26

- Previous demo: **not** claude-video-kit. It was built by `agent-acceptance-gate/scripts/build-cn-demo-video.py` with PIL + ffmpeg + edge-tts.
- Current demo: rendered through the claude-video-kit path at `/Users/zhangxu/Projects/claude-video-kit/examples/leo-labs-okxai-tip-knife/`.
- Voice caveat: `FISH_AUDIO_API_KEY` is still empty in `claude-video-kit/.env`, so this render used local `say` fallback audio, not Leo's Fish clone. Leo must paste the Fish key into `claude-video-kit/.env` and rerun `SAY_VOICE='Reed (中文（中国大陆）)' VIDEO_EXPLAINER_ALIGN_MODE=script ./scripts/render.sh examples/leo-labs-okxai-tip-knife` for the good voice.
