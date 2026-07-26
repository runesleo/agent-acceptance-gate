#!/usr/bin/env python3
"""Build ≤90s Chinese intro video for Leo Labs #3977 (no manual screen recording)."""

from __future__ import annotations

import subprocess
import os
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "research" / "demo-video-cn"
SLIDES_DIR = OUT_DIR / "slides"
AUDIO_DIR = OUT_DIR / "audio"
FINAL = OUT_DIR / "leo-labs-okxai-demo-zh.mp4"
DEFAULT_VOICE = "zh-CN-YunyangNeural"
FALLBACK_VOICE = "zh-CN-XiaoxiaoNeural"
DEFAULT_RATE = "+8%"
VOICE = os.environ.get("VOICE", DEFAULT_VOICE)
RATE = os.environ.get("RATE", DEFAULT_RATE)
EDGE_RETRIES = 2

W, H = 1280, 720
BG = (10, 14, 22)
FG = (240, 244, 255)
MUTED = (160, 170, 190)
ACCENT = (80, 180, 255)
OK = (90, 210, 150)

# (seconds, voiceover, title, bullets)
SCENES = [
    (
        6,
        "昨天那种写法像服务清单，用户刷到就走。Leo Labs 现在只讲三把刀。",
        "Leo Labs · OKX.AI #3977",
        ["不要 cockpit 大词", "只讲付费前的痛", "验真 · 矩阵 · 决策卡"],
    ),
    (
        8,
        "第一把，晒单验真。别人晒收益，先拿排行榜、持仓和现金回流对账，别被截图带节奏。",
        "① 晒单验真",
        ["排行榜 vs 持仓", "cashPnL / 回流对账", "截图先过闸"],
    ),
    (
        8,
        "第二把，同场矩阵。同一场比赛的盘口一起看，价差、流动性、矛盾信号马上露出来。",
        "② 同场矩阵",
        ["同场盘口放一屏", "spread / volume / overround", "先看结构，再看方向"],
    ),
    (
        8,
        "第三把，决策卡。下单前只问三个结果：跳过、观望，还是人工复核。eligible 不等于买点。",
        "③ 决策卡",
        ["skip / watch / review", "硬闸先拦冲动单", "非喊单 · 非托管"],
    ),
    (
        6,
        "扫描器只留一拍：找活跃盘和坏盘口，不再把二十个 endpoint 当卖点念。",
        "扫描器：一拍就够",
        ["active markets", "bad spreads", "wallet one-pager"],
    ),
    (
        7,
        "Agent 调一次，JSON 进，结构化结论出。信息会过期，所以适合按次付费。",
        "按次付费数据闸",
        ["JSON in", "structured verdict out", "stale data = pay per call"],
    ),
    (
        7,
        "看 demo。要试 Leo Labs，就从验真、矩阵、决策卡开始。OKX AI。",
        "Demo CTA",
        ["验真", "矩阵", "决策卡", "#OKXAI"],
    ),
]


def find_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Light.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for path in candidates:
        p = Path(path)
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size=size, index=0)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_slide(title: str, bullets: list[str], idx: int, total: int) -> Image.Image:
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)
    font_title = find_font(48)
    font_body = find_font(34)
    font_small = find_font(22)

    draw.rectangle([0, 0, 12, H], fill=ACCENT)
    draw.text((48, 40), f"Leo Labs  ·  {idx}/{total}", font=font_small, fill=MUTED)
    draw.text((48, 100), title, font=font_title, fill=FG)

    y = 220
    for bullet in bullets:
        draw.ellipse([56, y + 14, 72, y + 30], fill=OK)
        draw.text((96, y), bullet, font=font_body, fill=FG)
        y += 70

    draw.text((48, H - 56), "OKX.AI Genesis  ·  按次付费数据闸  ·  非投资建议", font=font_small, fill=MUTED)
    return img


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        return wf.getnframes() / float(wf.getframerate())


def edge_tts_to_mp3(text: str, mp3_path: Path, voice: str) -> None:
    subprocess.run(
        [
            "edge-tts",
            "--voice", voice,
            "--rate", RATE,
            "--text", text,
            "--write-media", str(mp3_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )


def audio_to_wav(audio_path: Path, wav_path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(audio_path),
            "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1",
            str(wav_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def say_tingting_to_wav(text: str, wav_path: Path) -> str:
    aiff_path = wav_path.with_suffix(".aiff")
    subprocess.run(
        ["say", "-v", "Tingting", "-r", "185", "-o", str(aiff_path), text],
        check=True,
    )
    audio_to_wav(aiff_path, wav_path)
    return "Tingting"


def narration_to_wav(text: str, mp3_path: Path, wav_path: Path) -> str:
    voices = [VOICE]
    if VOICE != FALLBACK_VOICE:
        voices.append(FALLBACK_VOICE)

    last_error: Exception | None = None
    for voice in voices:
        for attempt in range(1, EDGE_RETRIES + 1):
            try:
                edge_tts_to_mp3(text, mp3_path, voice)
                audio_to_wav(mp3_path, wav_path)
                return voice
            except (OSError, subprocess.CalledProcessError) as exc:
                last_error = exc
                detail = getattr(exc, "stderr", "") or str(exc)
                detail = detail.strip().splitlines()[-1] if detail.strip() else str(exc)
                print(f"WARN: edge-tts failed with {voice} attempt {attempt}/{EDGE_RETRIES}: {detail}")

    print(f"WARN: falling back to macOS Tingting after edge-tts failure: {last_error}")
    return say_tingting_to_wav(text, wav_path)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SLIDES_DIR.mkdir(parents=True, exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    concat_parts: list[Path] = []
    total = len(SCENES)
    voices_used: set[str] = set()
    print(f"TTS default: voice={VOICE} rate={RATE}")

    for i, (min_secs, line, title, bullets) in enumerate(SCENES, start=1):
        slide_path = SLIDES_DIR / f"slide-{i:02d}.png"
        draw_slide(title, bullets, i, total).save(slide_path)

        mp3 = AUDIO_DIR / f"line-{i:02d}.mp3"
        wav = AUDIO_DIR / f"line-{i:02d}.wav"
        voice_used = narration_to_wav(line, mp3, wav)
        voices_used.add(voice_used)
        audio_secs = wav_duration(wav)
        # Hold slide at least min_secs, or audio length + small pad
        duration = max(float(min_secs), audio_secs + 0.45)

        part = OUT_DIR / f"part-{i:02d}.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-loop", "1", "-i", str(slide_path),
                "-i", str(wav),
                "-c:v", "libx264", "-tune", "stillimage",
                "-c:a", "aac", "-b:a", "128k",
                "-pix_fmt", "yuv420p",
                "-t", f"{duration:.2f}",
                "-shortest",
                str(part),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        concat_parts.append(part)
        print(f"scene {i}/{total}: {duration:.1f}s — {title} — {voice_used}")

    list_file = OUT_DIR / "concat.txt"
    list_file.write_text("".join(f"file '{p.name}'\n" for p in concat_parts), encoding="utf-8")

    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(list_file),
            "-c", "copy",
            str(FINAL),
        ],
        check=True,
        cwd=str(OUT_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    # Probe duration
    probe = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(FINAL),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    dur = float(probe.stdout.strip())
    print(f"\nDONE: {FINAL}")
    print(f"duration: {dur:.1f}s")
    print(f"voices: {', '.join(sorted(voices_used))}")
    if dur > 90:
        print("WARN: over 90s — trim SCENES or speed up RATE")


if __name__ == "__main__":
    main()
