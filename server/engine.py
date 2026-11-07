# -*- coding: utf-8 -*-
"""
离线翻译引擎封装。

底层用 Argos Translate（CTranslate2 + SentencePiece），模型全部落盘在 ../models，
安装完成后拔网线也能用。
"""
from __future__ import annotations

import os
import re
import threading
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# argostranslate 会读这些环境变量，必须在 import 之前设置
# 注意：模型目录的变量名是 ARGOS_PACKAGES_DIR（复数），写成单数会被忽略
os.environ.setdefault("ARGOS_PACKAGES_DIR", str(MODEL_DIR))
os.environ.setdefault("ARGOS_DEVICE_TYPE", "cpu")
os.environ.setdefault("ARGOS_CHUNK_TYPE", "MINISBD")
# 关掉 argos 自带的使用统计上报
os.environ.setdefault("ARGOS_STATS_COLLECTION", "0")

import argostranslate.package as argos_package  # noqa: E402
import argostranslate.translate as argos_translate  # noqa: E402

_LOCK = threading.RLock()
_CACHE: "OrderedDict[tuple, str]" = OrderedDict()
_CACHE_MAX = 512

# 项目对外暴露的语言代码 -> argos 代码
LANG_NAMES = {
    "zh": "中文",
    "en": "English",
    "ja": "日本語",
    "ko": "한국어",
    "fr": "Français",
    "de": "Deutsch",
    "es": "Español",
    "ru": "Русский",
    "it": "Italiano",
    "pt": "Português",
    "ar": "العربية",
    "hi": "हिन्दी",
    "nl": "Nederlands",
    "pl": "Polski",
    "tr": "Türkçe",
    "vi": "Tiếng Việt",
    "th": "ไทย",
    "uk": "Українська",
    "cs": "Čeština",
    "sv": "Svenska",
}


class EngineError(Exception):
    """模型缺失 / 下载失败等可读错误。"""


# --------------------------------------------------------------------------- #
# 语言检测（轻量启发式，够用即可，不引入额外模型）
# --------------------------------------------------------------------------- #
_CJK = re.compile(r"[\u4e00-\u9fff]")
_KANA = re.compile(r"[\u3040-\u30ff]")
_HANGUL = re.compile(r"[\uac00-\ud7af]")
_CYRILLIC = re.compile(r"[\u0400-\u04ff]")


def detect(text: str) -> str:
    if not text.strip():
        return "en"
    total = max(len(re.sub(r"\s", "", text)), 1)
    if len(_KANA.findall(text)) / total > 0.05:
        return "ja"
    if len(_HANGUL.findall(text)) / total > 0.05:
        return "ko"
    if len(_CJK.findall(text)) / total > 0.05:
        return "zh"
    if len(_CYRILLIC.findall(text)) / total > 0.10:
        return "ru"
    return "en"


# --------------------------------------------------------------------------- #
# 模型管理
# --------------------------------------------------------------------------- #
def installed_pairs() -> list[dict]:
    pairs = []
    with _LOCK:
        for lang in argos_translate.get_installed_languages():
            for t in lang.translations_from:
                if t.to_lang.code == lang.code:  # argos 会自动塞一个“同语言”占位，跳过
                    continue
                pairs.append(
                    {
                        "from": lang.code,
                        "to": t.to_lang.code,
                        "from_name": LANG_NAMES.get(lang.code, lang.code),
                        "to_name": LANG_NAMES.get(t.to_lang.code, t.to_lang.code),
                    }
                )
    return pairs


def download_index() -> list:
    argos_package.update_package_index()
    return argos_package.get_available_packages()


def install_pair(from_code: str, to_code: str) -> dict:
    """下载并安装某个语言对，已安装则直接返回。"""
    if from_code == to_code:
        return {"from": from_code, "to": to_code, "already": True}
    with _LOCK:
        if _find_translation(from_code, to_code) is not None:
            return {"from": from_code, "to": to_code, "already": True}
        try:
            available = download_index()
        except Exception as exc:  # 断网 / CDN 不可达
            raise EngineError(
                f"无法获取模型索引（需要联网一次）：{exc}"
            ) from exc
        pkg = next(
            (p for p in available
             if p.from_code == from_code and p.to_code == to_code),
            None,
        )
        if pkg is None:
            raise EngineError(f"官方索引里没有 {from_code} -> {to_code} 这个语言对")
        path = pkg.download()
        argos_package.install_from_path(path)
        _CACHE.clear()
        return {"from": from_code, "to": to_code, "already": False}


def _find_translation(from_code: str, to_code: str):
    langs = argos_translate.get_installed_languages()
    src = next((l for l in langs if l.code == from_code), None)
    dst = next((l for l in langs if l.code == to_code), None)
    if src is None or dst is None:
        return None
    return src.get_translation(dst)


# --------------------------------------------------------------------------- #
# 翻译
# --------------------------------------------------------------------------- #
_SENT_SPLIT = re.compile(r"(?<=[。！？；!?;\n])")


def _chunks(text: str, limit: int = 900) -> list[str]:
    """按句切块，避免超长文本一次性喂给模型。"""
    parts = [p for p in _SENT_SPLIT.split(text) if p.strip()]
    out, buf = [], ""
    for p in parts:
        if len(buf) + len(p) > limit and buf:
            out.append(buf)
            buf = p
        else:
            buf += p
    if buf:
        out.append(buf)
    return out or [text]


def translate(text: str, from_code: str = "auto", to_code: str = "zh") -> dict:
    text = (text or "").strip()
    if not text:
        raise EngineError("待翻译文本为空")
    if len(text) > 20000:
        raise EngineError("单次最多 20000 字符")

    src = detect(text) if from_code in ("auto", "", None) else from_code
    if src == to_code:
        return {"text": text, "from": src, "to": to_code, "cached": False}

    key = (src, to_code, text)
    with _LOCK:
        if key in _CACHE:
            _CACHE.move_to_end(key)
            return {"text": _CACHE[key], "from": src, "to": to_code, "cached": True}

        translation = _find_translation(src, to_code)
        if translation is None:
            raise EngineError(
                f"未安装 {src} -> {to_code} 的模型。先调用 /install 下载，"
                f"或在网页插件里点“下载模型”。"
            )
        pieces = [translation.translate(c) for c in _chunks(text)]
        result = "".join(pieces).strip()

        _CACHE[key] = result
        while len(_CACHE) > _CACHE_MAX:
            _CACHE.popitem(last=False)
    return {"text": result, "from": src, "to": to_code, "cached": False}


def warmup(pairs: list[tuple[str, str]] | None = None) -> None:
    """预热：把模型载入内存，首次请求不至于卡顿。"""
    pairs = pairs or [(p["from"], p["to"]) for p in installed_pairs()]
    for f, t in pairs:
        try:
            translate("hello", f, t)
        except Exception:
            pass
