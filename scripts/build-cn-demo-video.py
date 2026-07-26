#!/usr/bin/env python3
"""Build ≤90s Chinese intro video for Leo Labs #3977 (no manual screen recording)."""

from __future__ import annotations

import subprocess
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "research" / "demo-video-cn"
SLIDES_DIR = OUT_DIR / "slides"
AUDIO_DIR = OUT_DIR / "audio"
FINAL = OUT_DIR / "leo-labs-okxai-demo-zh.mp4"

W, H = 1280, 720
BG = (10, 14, 22)
FG = (240, 244, 255)
MUTED = (160, 170, 190)
ACCENT = (80, 180, 255)
OK = (90, 210, 150)

# (seconds, voiceover, title, bullets)
SCENES = [
    (
        10,
        "我是一个人在做 Leo Labs，OKX AI 上的 Agent 服务商，编号三九七七。",
        "Leo Labs · OKX.AI #3977",
        ["一人团队 · ASP", "按次付费 · 边缘即时履约", "不是聊天机器人 · 不是喊单"],
    ),
    (
        14,
        "我们卖的是给 Agent 用的数据闸：行情会过期，结论结构化输出，不下单、不托管私钥。",
        "卖什么？",
        ["JSON 进 → 结构化结论出", "会过期的信号与检查", "只读公开数据 · 无卖家值守"],
    ),
    (
        16,
        "第一条：晒单流水验真。对比排行榜和持仓，可选完整现金回流，用来核别人晒的成绩单。",
        "① 晒单流水验真 · PnL 审计",
        ["排行榜 vs 持仓 cashPnL", "full 模式诚实标 incomplete", "抄钱包前先核验"],
    ),
    (
        16,
        "第二条：同场盘口矩阵，和下单前决策卡。矩阵看同场结构；决策卡输出跳过、观望、或可人工复核。过关不等于买点。",
        "② 同场矩阵 · 决策卡",
        ["同场矩阵 / 比赛卡硬闸", "skip / watch / 可人工复核", "eligible ≠ 买入建议"],
    ),
    (
        14,
        "第三条：toolkit 扫描器。市场扫描筛活跃盘，盘口健康看价差和 overround，钱包一页纸合成画像。",
        "③ 扫描器 · scan / health / wallet",
        ["市场扫描 volume+spread", "盘口健康 overround", "钱包一页纸组合卡"],
    ),
    (
        12,
        "另外还有发布就绪和交付验收，给 Agent 发文、交任务前做规则检查。软件工具赛道也能对上。",
        "④ 发布 / 交付检查",
        ["注水与断言核查", "交付证据闸门", "对齐 Software Utility 奖"],
    ),
    (
        12,
        "边缘按需履约，不用笔记本一直在线。关注话题 OKX AI，欢迎试用 Leo Labs。谢谢。",
        "按次付费 · 边缘履约",
        ["#OKXAI", "api.leolabs.me", "谢谢观看"],
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


def say_to_aiff(text: str, aiff_path: Path) -> None:
    subprocess.run(
        ["say", "-v", "Tingting", "-r", "185", "-o", str(aiff_path), text],
        check=True,
    )


def aiff_to_wav(aiff_path: Path, wav_path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(aiff_path),
            "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "1",
            str(wav_path),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    SLIDES_DIR.mkdir(parents=True, exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    concat_parts: list[Path] = []
    total = len(SCENES)

    for i, (min_secs, line, title, bullets) in enumerate(SCENES, start=1):
        slide_path = SLIDES_DIR / f"slide-{i:02d}.png"
        draw_slide(title, bullets, i, total).save(slide_path)

        aiff = AUDIO_DIR / f"line-{i:02d}.aiff"
        wav = AUDIO_DIR / f"line-{i:02d}.wav"
        say_to_aiff(line, aiff)
        aiff_to_wav(aiff, wav)
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
        print(f"scene {i}/{total}: {duration:.1f}s — {title}")

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
    if dur > 90:
        print("WARN: over 90s — trim SCENES or speed up say rate")


if __name__ == "__main__":
    main()
