# -*- coding: utf-8 -*-
"""
本地翻译服务 —— 只监听 127.0.0.1，不出网。

    python app.py --port 8765

接口：
    GET  /health                 健康检查
    GET  /langs                  已安装语言对
    POST /translate              {"q": "...", "from": "auto", "to": "zh"}
    POST /install                {"from": "en", "to": "zh"}  下载模型
"""
from __future__ import annotations

import argparse
import logging
import time

from flask import Flask, jsonify, request

import engine

app = Flask(__name__)
logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

# 只把这些来源放行：插件页面 + 本地调试页
ALLOWED_ORIGIN_PREFIX = ("chrome-extension://", "moz-extension://", "http://127.0.0.1", "http://localhost")


@app.after_request
def _cors(resp):
    origin = request.headers.get("Origin", "")
    if origin.startswith(ALLOWED_ORIGIN_PREFIX):
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Vary"] = "Origin"
    return resp


@app.route("/translate", methods=["OPTIONS"])
@app.route("/install", methods=["OPTIONS"])
def _preflight():
    return ("", 204)


@app.get("/health")
def health():
    pairs = engine.installed_pairs()
    return jsonify(
        ok=True,
        engine="argos-ctranslate2",
        offline=True,
        pairs=len(pairs),
        model_dir=str(engine.MODEL_DIR),
        model_dir_ok=engine.MODEL_DIR_OK,
        version="1.0.0",
    )


@app.get("/langs")
def langs():
    return jsonify(
        installed=engine.installed_pairs(),
        names=engine.LANG_NAMES,
        suggest=[{"from": "en", "to": "zh"}, {"from": "zh", "to": "en"}],
    )


@app.post("/translate")
def translate():
    data = request.get_json(silent=True) or {}
    text = (data.get("q") or data.get("text") or "").strip()
    if not text:
        return jsonify(ok=False, error="缺少参数 q"), 400
    started = time.perf_counter()
    try:
        result = engine.translate(
            text,
            from_code=(data.get("from") or "auto").lower(),
            to_code=(data.get("to") or "zh").lower(),
        )
    except engine.EngineError as exc:
        return jsonify(ok=False, error=str(exc), code="MODEL_MISSING"), 409
    except Exception as exc:  # 兜底，别让插件收到 500 html
        logging.exception("translate failed")
        return jsonify(ok=False, error=f"翻译失败：{exc}"), 500
    result["ok"] = True
    result["ms"] = round((time.perf_counter() - started) * 1000, 1)
    return jsonify(result)


@app.post("/install")
def install():
    data = request.get_json(silent=True) or {}
    f = (data.get("from") or "").lower()
    t = (data.get("to") or "").lower()
    if not f or not t:
        return jsonify(ok=False, error="缺少 from / to"), 400
    try:
        info = engine.install_pair(f, t)
    except engine.EngineError as exc:
        return jsonify(ok=False, error=str(exc)), 409
    except Exception as exc:
        logging.exception("install failed")
        return jsonify(ok=False, error=f"模型安装失败：{exc}"), 500
    info["ok"] = True
    return jsonify(info)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--warmup", action="store_true", help="启动时把模型载入内存")
    args = ap.parse_args()

    pairs = engine.installed_pairs()
    logging.info("已安装语言对：%s", ", ".join(f'{p["from"]}->{p["to"]}' for p in pairs) or "（无）")
    if args.warmup:
        engine.warmup()
    logging.info("服务已启动： http://127.0.0.1:%s", args.port)
    app.run(host="127.0.0.1", port=args.port, threaded=True, debug=False)


if __name__ == "__main__":
    main()
