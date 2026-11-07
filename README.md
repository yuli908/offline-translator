# 离线翻译 · Offline Translator

一个**完全离线**的中英翻译插件：浏览器里划词即译，模型跑在你自己电脑上，
输入的每一个字都不会离开本机。

```
┌─────────────────────┐        HTTP (127.0.0.1)        ┌──────────────────────┐
│  Chrome / Edge 扩展  │  ───────────────────────────>  │  Flask 本地服务       │
│  划词 / 右键 / 弹窗   │  <───────────────────────────  │  Argos + CTranslate2 │
└─────────────────────┘                                └──────────┬───────────┘
                                                                  │
                                                       ┌──────────▼───────────┐
                                                       │  models/  离线模型权重 │
                                                       └──────────────────────┘
```

- **引擎**：[Argos Translate](https://github.com/argosopentech/argos-translate)（OpenNMT/OPUS-MT 模型 + CTranslate2 推理），纯 CPU、无需显卡。
- **服务**：Flask，只监听 `127.0.0.1:8765`，不对外开放。
- **插件**：Manifest V3，选中文字浮出「译」按钮，右键菜单，弹窗手输翻译。

## 快速开始

### 1. 安装服务端（只需一次）

双击 **`setup.bat`**。它会：

1. 创建 `.venv` 虚拟环境
2. 安装 `argostranslate` / `flask`
3. 下载中英双向模型到 `models/`（约 200MB，需要联网一次）

> 需要 Python 3.10+，安装时记得勾选 *Add Python to PATH*。

### 2. 启动服务

双击 **`start.bat`**，看到下面这行就成了：

```
Running on http://127.0.0.1:8765
```

窗口别关，关掉服务插件就用不了。

### 3. 装浏览器插件

1. Chrome / Edge 打开 `chrome://extensions`（Edge 是 `edge://extensions`）
2. 右上角打开 **开发者模式**
3. 点 **加载已解压的扩展程序**，选择本仓库的 `extension` 目录
4. 把插件图标固定到工具栏

### 4. 用起来

| 方式 | 操作 |
| --- | --- |
| 划词 | 网页里选中文字 → 点浮出的「译」 |
| 右键 | 选中文字 → 右键 → *离线翻译「…」* |
| 快捷键 | 选中文字 → `Alt + T` |
| 弹窗 | 点插件图标 → 粘贴文字 → `Ctrl + Enter` |

目标语言在弹窗右上角切换，选一次就记住了。

## 目录结构

```
offline-translator/
├── setup.bat                 一键安装（venv + 依赖 + 模型）
├── start.bat                 启动本地服务
├── server/
│   ├── app.py                Flask 接口
│   ├── engine.py             引擎封装：语言检测、分句、缓存、模型管理
│   └── requirements.txt
├── extension/
│   ├── manifest.json         MV3 清单
│   ├── background.js         请求代理、右键菜单、快捷键
│   ├── content.js            划词气泡 + 结果卡片（Shadow DOM）
│   ├── popup.html/js/css     弹窗界面
│   └── icons/                图标
├── tools/
│   ├── download_models.py    预下载模型
│   └── make_icons.py         生成图标
└── models/                   模型权重（不入库；路径含中文时见下方「模型放哪」）
```

## 模型放哪

`sentencepiece` / `ctranslate2` 的 Windows 原生库用 ANSI 接口打开文件，
**路径里带中文就会报 `NOT_FOUND`**（哪怕文件确实存在）。所以模型目录会自动避让：

1. 环境变量 `OFFLINE_TRANSLATOR_MODEL_DIR`
2. 项目根目录的 `model_dir.txt`（只写一行绝对路径）
3. `<项目>/models` —— 仅当项目路径是纯英文时
4. `%LOCALAPPDATA%\offline-translator\models` —— 兜底

当前选中的目录可以直接查：

```bash
curl -s http://127.0.0.1:8765/health
# {"model_dir":"C:\\Users\\<你>\\AppData\\Local\\offline-translator\\models","model_dir_ok":true, ...}
```

想把模型放回 D 盘，就建个 `D:\ot-models`，在项目根目录写 `model_dir.txt` 内容为 `D:\ot-models`，
再把模型文件夹整体挪过去即可。

> 只有**模型目录**需要纯英文，项目代码、扩展目录放中文路径都没问题。

## HTTP 接口

服务只绑定 `127.0.0.1`，并且只对 `chrome-extension://` / `moz-extension://` / 本地页面回 CORS 头。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查，返回已装语言对数量 |
| GET | `/langs` | 已安装语言对 + 语言名称表 |
| POST | `/translate` | `{"q":"text","from":"auto","to":"zh"}` |
| POST | `/install` | `{"from":"ja","to":"zh"}` 下载新语言对 |

示例：

```bash
curl -X POST http://127.0.0.1:8765/translate \
  -H "Content-Type: application/json" \
  -d '{"q":"Good morning","from":"auto","to":"zh"}'
# {"ok":true,"text":"早上好","from":"en","to":"zh","ms":42.7,"cached":false}
```

## 支持更多语言

Argos 官方索引有 100+ 个语言对。下 `ja -> zh`：

```bash
.venv\Scripts\python.exe tools\download_models.py ja zh
```

或直接调接口：

```bash
curl -X POST http://127.0.0.1:8765/install -H "Content-Type: application/json" -d '{"from":"ja","to":"zh"}'
```

也可以在插件弹窗里点「下载模型」按钮（默认装中英双向）。

## 常见问题

**插件提示「服务未启动」**
`start.bat` 那个黑窗口没开，或者被关了。重新双击一次。

**端口被占用**
改 `start.bat` 里的 `--port 8765`，并把 `extension/background.js` 的默认 `port` 一起改掉，然后在扩展页面点刷新。

**翻译质量一般？**
Argos 用的是 OPUS-MT 级别的小模型（约 100MB/语言对），胜在完全离线、速度几十毫秒。
要更好的质量可以换本地大模型（Ollama + qwen），接口保持一致即可替换 `server/engine.py`。

**首句翻译特别慢**
第一次调用要加载模型进内存（约 1-2 秒）。`start.bat` 已经带了 `--warmup`，正常不会感知到。

**能翻译整页吗**
目前是划词 / 选中段落。整页翻译需要 DOM 遍历和批量接口，没有做。

**报错 `NOT_FOUND ... sentencepiece.model`**
模型目录在中文路径下。看上面「模型放哪」，把模型挪到纯英文目录，或在项目根写 `model_dir.txt`。
`%LOCALAPPDATA%\offline-translator\models` 是自动兜底位置，正常不会踩到。

**整个项目换盘 / 改目录后不能用了**
`.venv` 可以整体搬（里面记录的是解释器位置，不是项目位置），搬完直接跑 `start.bat` 即可。
只有一种情况要重装：换了 Python 解释器版本。

## 隐私

- 服务只监听回环地址，外网访问不到。
- CORS 白名单只放扩展来源，普通网页的 JS 无法调用你的本地翻译服务。
- 除了首次下载模型，运行期间零网络请求。

## License

MIT
