# Demo 视频管线真相 · 2026-07-26 晚

## 现在这版
- **管线**：`claude-video-kit`（Remotion）
- **项目**：`claude-video-kit/examples/leo-labs-okxai-tip-knife/`
- **画幅**：**横版 1920×1080**
- **配音**：Fish key 仍空 → **edge-tts `zh-CN-YunyangNeural`**（比 macOS say 好听；仍不如你本人 Fish 克隆）
- **封面**：`gen_video_cover.py` + `data_contrast`（+128% vs incomplete）
  - X 横卡优先：`cover-16x9.png`
  - 方图：`cover-1x1.png`

## 若还要「你本人那把声」
往 `claude-video-kit/.env` 填：
```
FISH_AUDIO_API_KEY=...
FISH_AUDIO_VOICE_ID=...
```
然后：
```bash
cd ~/Projects/claude-video-kit
./scripts/render.sh examples/leo-labs-okxai-tip-knife
```
