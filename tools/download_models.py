# -*- coding: utf-8 -*-
"""预下载翻译模型（首次需要联网，之后完全离线）。

    python tools/download_models.py            # 默认装 en<->zh
    python tools/download_models.py en zh      # 装 en->zh 和 zh->en
    python tools/download_models.py en zh,zh en   # 同上，逗号分隔的多语言组
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

import engine  # noqa: E402


def main() -> int:
    args = sys.argv[1:]
    if not args:
        jobs = [("en", "zh"), ("zh", "en")]
    elif len(args) % 2 == 0:
        jobs = [(args[i], args[i + 1]) for i in range(0, len(args), 2)]
    else:
        jobs = []
        for code in args:
            code = code.strip()
            if not code:
                continue
            for other in args:
                other = other.strip()
                if other and other != code:
                    jobs.append((code, other))

    ok = True
    for f, t in jobs:
        try:
            info = engine.install_pair(f, t)
            tag = "已存在" if info.get("already") else "下载完成"
            print(f"[OK] {f} -> {t}  {tag}")
        except Exception as exc:
            ok = False
            print(f"[X ] {f} -> {t}  失败：{exc}")
    print("\n当前已安装：", ", ".join(f'{p["from"]}->{p["to"]}' for p in engine.installed_pairs()) or "（无）")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
