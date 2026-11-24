# Clash (Mihomo) 精细化 AI 隔离 + 大流量下载分流方案

基于 GitHub 最新主流上游规则库（[`MetaCubeX/meta-rules-dat`](https://github.com/MetaCubeX/meta-rules-dat) 每日同步 [`v2fly/domain-list-community`](https://github.com/v2fly/domain-list-community) + Hugging Face 官方 XetHub CDN 规范 + Google Antigravity / Cloud Code 社区实测域名）定制。

---

## 一、 核心架构与痛点解决

1. **Google 共享域名“四级剥离”（彻底解决锁区与吃流量矛盾）**
   - **第 1 级（纯下载与流媒体剥离 -> `⬇️ 下载专用` -> `📦 大流量节点`）**：提前将 `dl.google.com`、`gvt1~3.com`、`storage.googleapis.com`、`drive.usercontent.google.com`、`gcr.io`、`pkg.dev`、`googlevideo.com`（YouTube 4K 视频流）剥离到大流量节点，**绝不消耗昂贵的 AI 干净节点流量**。
   - **第 2 级（Antigravity 专属 -> `🌌 Google Antigravity`）**：最优先匹配 `antigravity.google`、`antigravity-unleash.goog`、`antigravity-pa.googleapis.com`、`cloudcode-pa.googleapis.com` 及其 `daily`/`autopush`/`sandbox` 全系端点。
   - **第 3 级（Google AI 全家桶 -> `✨ Google AI`）**：涵盖 Gemini、AI Studio、NotebookLM、Jules、Labs、Stitch、Opal、Flow、IDX (Firebase Studio)、Colab、Vertex AI (`*-aiplatform.googleapis.com`) 及所有 `-pa.googleapis.com` / `-pa.clients6.google.com` 区域感知后台接口。
   - **第 4 级（Google 鉴权与通用服务隔离 -> `🔍 Google 服务`）**：将 `accounts.google.com`、`oauth2.googleapis.com`、`play.googleapis.com`（最隐蔽的锁区元凶！）、`gstatic.com`、`recaptcha.net` 及剩余 `google.mrs` **排在大流量兜底与 `cn.mrs` 之前**，独立分到 `🔍 Google 服务`（默认跟随 `✨ Google AI`，也可单独指定其他非香港节点），防止掉入香港大流量节点或被 `google@cn` 直连污染账号区域！

2. **全网下载与大模型权重强制走 `📦 大流量节点`（`⬇️ 下载专用`）**
   - **前置拦截设计**：由于社区 `category-ai-!cn` 聚合规则默认把 `huggingface` 和 `ollama` 算进了 AI 组，本方案将 `⬇️ 下载专用` **置于通用 AI 聚合规则与 GitHub 规则之前**：
     - **Hugging Face 全系**：`huggingface.co`、`hf.co`、`hf.space`、新版 **XetHub** 块存储 (`*.xethub.hf.co`、`cas-server`、`transfer`) 及全球 LFS CDN (`cdn-lfs*.hf.co`、`us.aws.cdn.hf.co`、`us.gcp.cdn.hf.co`)。
     - **AI 模型与数据集**：Civitai (`civitai.com` / `civitai-cdn.com`)、Ollama 权重源、Kaggle 数据集、TensorFlow Hub、Replicate 缓存。
     - **开发与镜像大文件**：GitHub Release / Objects / Raw / LFS / GHCR、Docker Hub / Quay / K8s、PyPI / Conda / npm / Crates.io / Go Proxy、OpenVSX / VS Code 插件市场、海外 Steam 下载（国内 Steam CDN 自动走直连）。

3. **各大 AI 独立策略组互不串线**
   - `🌌 Google Antigravity` / `✨ Google AI` / `🟠 Claude` / `🟢 OpenAI` / `💻 AI 编程` (Cursor、Windsurf、Copilot、JetBrains AI) / `🤖 其他 AI` (Grok、Perplexity、OpenRouter、Poe 等) 全部独立分组，并且自动用正则过滤掉了香港、澳门、俄罗斯等不支持地区节点。

4. **Antigravity 本地回环与 DNS 防泄露加固**
   - 顶层锁定 `127.0.0.0/8` 与 `localhost` 直连 + TUN `route-exclude-address`，防止劫持 Antigravity 本地 Go `language_server` 与浏览器 CDP 端口（避免 `HTTP 400` 断连）。
   - 开启 Mihomo `dns.respect-rules: true`，使 Google/AI 域名的远程 DoH 解析也强制经过对应代理节点出口，彻底杜绝国内 DNS 抢答与 ECS 跨区泄露。

---

## 二、 两种使用方式（任选其一）

### 方式 A（最推荐）：Clash Verge Rev / Clash Party 一键覆写脚本
无需改动你现有的机场订阅配置：
1. 打开 **Clash Verge Rev**（或 Mihomo Party） -> 左侧 **订阅 (Profiles)**。
2. 点击 **全局扩展脚本 (Script)**（或右键某个机场订阅 -> **编辑脚本**）。
3. 将 [`override.js`](./override.js) 的内容完整复制粘贴进去，保存并启用即可（脚本完全自包含，无需拷贝本地文件夹）。

### 方式 B：独立完整配置文件 (`config.yaml` + `rules/`)
适合直接导入独立配置、OpenClash、ShellCrash 或路由器 Mihomo 核心：
1. 打开 [`config.yaml`](./config.yaml)，找到 `proxy-providers -> MyAirport -> url`，替换为你的机场订阅地址。
2. 保持 `config.yaml` 与同级 [`rules/`](./rules) 文件夹在同一目录下加载即可。

### 方式 C（进阶自动化）：推送到 GitHub Actions 每日自动去重 + 编译 `.mrs`
本项目已内置零依赖去重编译器 [`scripts/build_rules.py`](./scripts/build_rules.py) 与工作流 [`.github/workflows/daily-build.yml`](./.github/workflows/daily-build.yml)：
1. 将当前整个目录推送到你的 GitHub 仓库（确保仓库 `Settings -> Actions -> General -> Workflow permissions` 勾选 **Read and write permissions**）。
2. GitHub Actions 会在每天**北京时间 06:00**（以及每次你修改 `rules/` 推送或手动点击 `Run workflow` 时）自动运行：
   - **域名精确去重 + 父子后缀树收敛**：如存在 `+.hf.co` 时自动剔除多余的子后缀 `+.xethub.hf.co` 与子域名 `cdn-lfs.hf.co`。
   - **跨分组优先级差集去重**：自动从 `ai_others` 剔除 `downloads`（HuggingFace/Ollama）与各大独立 AI 的重复域名；自动从 `google_service` 剔除 Antigravity、Google AI 与 YouTube/下载域名；自动从 `cn_domain` 剔除会暴露国内 IP 的 `google@cn` 重叠域名。
   - **IPv4 / IPv6 CIDR 网段数学合并**：基于 `ipaddress.collapse_addresses` 自动剔除子网包含重复并将连续相邻网段合并为超网。
   - **自动编译二进制 `.mrs` 与自托管脚本**：自动下载官方最新 `mihomo` CLI 将去重结果编译到 `dist/ruleset/*.mrs`，并生成填好你仓库 CDN 地址的 [`dist/override-selfhosted.js`](./dist/override-selfhosted.js) 和去重报表 [`dist/BUILD_REPORT.md`](./dist/BUILD_REPORT.md)。

---

## 三、 节点选择最佳实践建议

| 策略组 | 推荐选择的节点类型 | 说明 |
| :--- | :--- | :--- |
| **📦 大流量节点** | 香港 / 日本 / 新加坡 **0.1x~1x 大带宽节点**（或默认的 `⚡ 大流量自动优选`） | 承接国外日常网页、GitHub 代码克隆、Telegram 及所有下载流量 |
| **⬇️ 下载专用** | 默认保持 **`📦 大流量节点`** | Hugging Face 下模型、拉 Docker 镜像、看 YouTube 4K 自动走此组 |
| **🌌 Google Antigravity** | **美国 / 新加坡 / 日本** 干净低风控节点 | 严禁选香港；建议固定一个稳定的美区或新家坡节点 |
| **✨ Google AI** | 默认保持 **`🌌 Google Antigravity`**（或同国家节点） | 与 Antigravity 保持同 IP 可最大程度降低 Google 账号风控 |
| **🔍 Google 服务** | 默认保持 **`✨ Google AI`**（或任意非香港节点） | 已剥离 YouTube 与 Google 下载，日常搜索/鉴权几乎不耗流量，跟 AI 同区最稳；若想单独分去其他节点也可直接切换 |
| **🟠 Claude** | **美国 / 英国 / 欧洲** 高纯净度原生/家宽节点 | Claude 对机房 IP 风控最严，建议单独固定一个测通的干净节点 |
| **🟢 OpenAI** | **美国 / 日本 / 新加坡 / 台湾** 节点 | 支持 ChatGPT 网页、API、Sora 与 LiveKit 实时语音 |
