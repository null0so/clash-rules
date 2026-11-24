/**
 * Clash Verge Rev / Clash Party (Mihomo Party) 全局扩展覆写脚本 (override.js)
 *
 * 使用方法：
 *   打开 Clash Verge Rev -> 订阅 (Profiles) -> 全局扩展脚本 (Script) -> 右键编辑，
 *   将本脚本完整粘贴保存并启用即可！无需修改任何机场订阅链接，自动接管已有订阅节点！
 *
 * 分流效果：
 *   - 🌌 Google Antigravity：独立策略组（Antigravity IDE/CLI/SDK & Cloud Code 全端点）
 *   - ✨ Google AI：独立策略组（Gemini / AI Studio / NotebookLM / Jules / Labs / Vertex AI）
 *   - 🔍 Google 服务：独立隔离组（Google 账号/OAuth/Play区域校验/搜索/API，防掉入香港节点导致锁区）
 *   - 🟠 Claude：独立策略组（Anthropic / Claude Web / Claude Code / MCP）
 *   - 🟢 OpenAI：独立策略组（ChatGPT / Sora / API / LiveKit 语音）
 *   - 💻 AI 编程：独立策略组（Cursor / Windsurf / GitHub Copilot / JetBrains AI 等）
 *   - 🤖 其他 AI：独立策略组（xAI Grok / Perplexity / OpenRouter / Poe / Groq / Midjourney 等）
 *   - ⬇️ 下载专用 -> 📦 大流量节点：HuggingFace (含 XetHub & LFS)、Civitai、Ollama、Kaggle、
 *     GitHub Release/LFS/GHCR、Docker、PyPI/Conda/npm/Cargo、OpenVSX 以及剥离出的 Google 下载/YouTube 视频流
 *   - 📦 大流量节点：所有国外常规流量默认出口
 */

function main(config) {
  const CDN = "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@meta/geo";
  const NO_INFO_REGEX = "(?i)剩余|到期|官网|套餐|重置|群组|频道";
  const AI_SAFE_EXCLUDE = "(?i)港|HK|Hong\\s?Kong|澳门|MO|Macao|俄|RU|Russia|中国|CN|剩余|到期|官网|套餐|重置|群组|频道";
  const HIGH_TRAFFIC_EXCLUDE = "(?i)高倍率|[2-9](\\.\\d+)?[xX倍]|家宽|住宅|原生|剩余|到期|官网|套餐|重置|群组|频道";

  // 1. 强化嗅探与防泄露 DNS（确保 Google / Antigravity 域名解析不泄露国内 ECS）
  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["sniffer"] = {
    enable: true,
    "force-dns-mapping": true,
    "parse-pure-ip": true,
    "override-destination": false,
    sniff: {
      HTTP: { ports: [80, "8080-8880"], "override-destination": true },
      TLS: { ports: [443, 8443] },
      QUIC: { ports: [443, 8443] },
    },
    "skip-domain": ["Mijia Cloud", "+.push.apple.com", "localhost", "+.local"],
  };

  config["dns"] = Object.assign({}, config["dns"] || {}, {
    enable: true,
    ipv6: false,
    "enhanced-mode": "fake-ip",
    "respect-rules": true,
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    "proxy-server-nameserver": [
      "https://223.5.5.5/dns-query",
      "https://120.53.53.53/dns-query",
    ],
    "nameserver-policy": {
      "rule-set:private_domain,cn_domain": [
        "https://223.5.5.5/dns-query",
        "https://120.53.53.53/dns-query",
      ],
    },
    nameserver: [
      "https://dns.google/dns-query",
      "https://cloudflare-dns.com/dns-query",
    ],
  });

  // 确保 TUN 模式排除 127.0.0.1 回环，防止劫持 Antigravity 本地 gRPC 语言服务器与浏览器调试端口
  if (config["tun"]) {
    const excludes = new Set(config["tun"]["route-exclude-address"] || []);
    excludes.add("127.0.0.0/8");
    excludes.add("::1/128");
    config["tun"]["route-exclude-address"] = Array.from(excludes);
  }

  // 2. 构建策略组
  config["proxy-groups"] = [
    {
      name: "📦 大流量节点",
      type: "select",
      proxies: ["⚡ 大流量自动优选"],
      "include-all": true,
      "exclude-filter": NO_INFO_REGEX,
    },
    {
      name: "⬇️ 下载专用",
      type: "select",
      proxies: ["📦 大流量节点", "⚡ 大流量自动优选", "🎯 全球直连"],
      "include-all": true,
      "exclude-filter": NO_INFO_REGEX,
    },
    {
      name: "🌌 Google Antigravity",
      type: "select",
      "include-all": true,
      "exclude-filter": AI_SAFE_EXCLUDE,
      proxies: ["📦 大流量节点"],
    },
    {
      name: "✨ Google AI",
      type: "select",
      proxies: ["🌌 Google Antigravity"],
      "include-all": true,
      "exclude-filter": AI_SAFE_EXCLUDE,
    },
    {
      name: "🔍 Google 服务",
      type: "select",
      proxies: ["✨ Google AI", "🌌 Google Antigravity", "📦 大流量节点"],
      "include-all": true,
      "exclude-filter": NO_INFO_REGEX,
    },
    {
      name: "🟠 Claude",
      type: "select",
      "include-all": true,
      "exclude-filter": AI_SAFE_EXCLUDE,
      proxies: ["🌌 Google Antigravity", "📦 大流量节点"],
    },
    {
      name: "🟢 OpenAI",
      type: "select",
      "include-all": true,
      "exclude-filter": AI_SAFE_EXCLUDE,
      proxies: ["🌌 Google Antigravity", "📦 大流量节点"],
    },
    {
      name: "💻 AI 编程",
      type: "select",
      proxies: ["🌌 Google Antigravity", "🟠 Claude", "🟢 OpenAI", "📦 大流量节点"],
      "include-all": true,
      "exclude-filter": AI_SAFE_EXCLUDE,
    },
    {
      name: "🤖 其他 AI",
      type: "select",
      proxies: ["✨ Google AI", "🟢 OpenAI", "🟠 Claude", "📦 大流量节点"],
      "include-all": true,
      "exclude-filter": AI_SAFE_EXCLUDE,
    },
    {
      name: "⚡ 大流量自动优选",
      type: "url-test",
      url: "https://www.gstatic.com/generate_204",
      interval: 300,
      tolerance: 50,
      lazy: true,
      "include-all": true,
      "exclude-filter": HIGH_TRAFFIC_EXCLUDE,
    },
    {
      name: "🎯 全球直连",
      type: "select",
      proxies: ["DIRECT", "📦 大流量节点"],
    },
  ];

  // 3. 注册远程 MetaCubeX 高性能 .mrs 规则提供者
  const mrsDomain = (name, file) => ({
    type: "http",
    behavior: "domain",
    format: "mrs",
    url: `${CDN}/geosite/${file}.mrs`,
    path: `./ruleset/${name}.mrs`,
    interval: 86400,
  });
  const mrsIp = (name, file) => ({
    type: "http",
    behavior: "ipcidr",
    format: "mrs",
    url: `${CDN}/geoip/${file}.mrs`,
    path: `./ruleset/${name}.mrs`,
    interval: 86400,
  });

  config["rule-providers"] = {
    private_domain: mrsDomain("private_domain", "private"),
    private_ip: mrsIp("private_ip", "private"),
    google_deepmind: mrsDomain("google_deepmind", "google-deepmind"),
    anthropic: mrsDomain("anthropic", "anthropic"),
    openai: mrsDomain("openai", "openai"),
    cursor: mrsDomain("cursor", "cursor"),
    windsurf: mrsDomain("windsurf", "windsurf"),
    github_copilot: mrsDomain("github_copilot", "github-copilot"),
    jetbrains_ai: mrsDomain("jetbrains_ai", "jetbrains-ai"),
    xai: mrsDomain("xai", "xai"),
    perplexity: mrsDomain("perplexity", "perplexity"),
    category_ai_not_cn: mrsDomain("category_ai_not_cn", "category-ai-!cn"),
    huggingface: mrsDomain("huggingface", "huggingface"),
    kaggle: mrsDomain("kaggle", "kaggle"),
    docker: mrsDomain("docker", "docker"),
    youtube: mrsDomain("youtube", "youtube"),
    google_domain: mrsDomain("google_domain", "google"),
    google_ip: mrsIp("google_ip", "google"),
    github: mrsDomain("github", "github"),
    steam_cn: mrsDomain("steam_cn", "steam@cn"),
    steam: mrsDomain("steam", "steam"),
    apple_cn: mrsDomain("apple_cn", "apple-cn"),
    microsoft_cn: mrsDomain("microsoft_cn", "microsoft@cn"),
    telegram_domain: mrsDomain("telegram_domain", "telegram"),
    telegram_ip: mrsIp("telegram_ip", "telegram"),
    geolocation_not_cn: mrsDomain("geolocation_not_cn", "geolocation-!cn"),
    cn_domain: mrsDomain("cn_domain", "cn"),
    cn_ip: mrsIp("cn_ip", "cn"),
  };

  // 4. 内联高精度规则 + 远程规则集（自包含，零本地文件路径依赖！）
  config["rules"] = [
    // === [1] 本地回环与内网直连（防劫持 Antigravity 本地服务） ===
    "DOMAIN,localhost,DIRECT",
    "DOMAIN-SUFFIX,local,DIRECT",
    "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR6,::1/128,DIRECT,no-resolve",
    "RULE-SET,private_domain,DIRECT",
    "RULE-SET,private_ip,DIRECT,no-resolve",

    // === [2] Google Antigravity 专属分流（最优先匹配） ===
    "DOMAIN-SUFFIX,antigravity.google,🌌 Google Antigravity",
    "DOMAIN-SUFFIX,antigravity-unleash.goog,🌌 Google Antigravity",
    "DOMAIN,antigravity.googleapis.com,🌌 Google Antigravity",
    "DOMAIN,antigravity-pa.googleapis.com,🌌 Google Antigravity",
    "DOMAIN,cloudcode-pa.googleapis.com,🌌 Google Antigravity",
    "DOMAIN,daily-cloudcode-pa.googleapis.com,🌌 Google Antigravity",
    "DOMAIN-SUFFIX,cloudcode-pa.sandbox.googleapis.com,🌌 Google Antigravity",
    "DOMAIN-SUFFIX,daily-cloudcode-pa.sandbox.googleapis.com,🌌 Google Antigravity",
    "DOMAIN-SUFFIX,autopush-cloudcode-pa.sandbox.googleapis.com,🌌 Google Antigravity",
    "DOMAIN-SUFFIX,preprod-daily-cloudcode-pa.sandbox.googleapis.com,🌌 Google Antigravity",
    "DOMAIN-KEYWORD,cloudcode-pa,🌌 Google Antigravity",
    "DOMAIN-KEYWORD,antigravity,🌌 Google Antigravity",
    "DOMAIN,cloudaicompanion.googleapis.com,🌌 Google Antigravity",
    "DOMAIN,aicode.googleapis.com,🌌 Google Antigravity",
    "DOMAIN,aida.googleapis.com,🌌 Google Antigravity",

    // === [3] Google AI 全家桶详细分流（Gemini / AI Studio / NotebookLM / Jules / Vertex AI） ===
    "DOMAIN-SUFFIX,gemini.google.com,✨ Google AI",
    "DOMAIN-SUFFIX,gemini.google,✨ Google AI",
    "DOMAIN-SUFFIX,bard.google.com,✨ Google AI",
    "DOMAIN-SUFFIX,gemini.gstatic.com,✨ Google AI",
    "DOMAIN,geminiweb-pa.clients.google.com,✨ Google AI",
    "DOMAIN,geminiweb-pa.clients6.google.com,✨ Google AI",
    "DOMAIN,robinfrontend-pa.googleapis.com,✨ Google AI",
    "DOMAIN,proactivebackend-pa.googleapis.com,✨ Google AI",
    "DOMAIN,geller-pa.googleapis.com,✨ Google AI",
    "DOMAIN,optimizationguide-pa.googleapis.com,✨ Google AI",
    "DOMAIN-SUFFIX,aistudio.google.com,✨ Google AI",
    "DOMAIN-SUFFIX,ai.studio,✨ Google AI",
    "DOMAIN-SUFFIX,makersuite.google.com,✨ Google AI",
    "DOMAIN,ai.google.dev,✨ Google AI",
    "DOMAIN-SUFFIX,generativeai.google,✨ Google AI",
    "DOMAIN-SUFFIX,generativelanguage.googleapis.com,✨ Google AI",
    "DOMAIN,alkalicore-pa.clients6.google.com,✨ Google AI",
    "DOMAIN,alkalimakersuite-pa.clients6.google.com,✨ Google AI",
    "DOMAIN,webchannel-alkalimakersuite-pa.clients6.google.com,✨ Google AI",
    "DOMAIN-KEYWORD,alkalimakersuite,✨ Google AI",
    "DOMAIN-KEYWORD,generativelanguage,✨ Google AI",
    "DOMAIN-SUFFIX,notebooklm.google.com,✨ Google AI",
    "DOMAIN-SUFFIX,notebooklm.google,✨ Google AI",
    "DOMAIN-SUFFIX,notebook.google.com,✨ Google AI",
    "DOMAIN-SUFFIX,notebook.google,✨ Google AI",
    "DOMAIN,notebooklm-pa.googleapis.com,✨ Google AI",
    "DOMAIN,notebooklm.googleapis.com,✨ Google AI",
    "DOMAIN,labstailwind.pa.googleapis.com,✨ Google AI",
    "DOMAIN-SUFFIX,jules.google.com,✨ Google AI",
    "DOMAIN-SUFFIX,jules.google,✨ Google AI",
    "DOMAIN-SUFFIX,labs.google,✨ Google AI",
    "DOMAIN-SUFFIX,labs.google.com,✨ Google AI",
    "DOMAIN,aisandbox-pa.googleapis.com,✨ Google AI",
    "DOMAIN-SUFFIX,flow.google,✨ Google AI",
    "DOMAIN-SUFFIX,flow.google.com,✨ Google AI",
    "DOMAIN-SUFFIX,opal.google,✨ Google AI",
    "DOMAIN-SUFFIX,opal.google.com,✨ Google AI",
    "DOMAIN-SUFFIX,stitch.withgoogle.com,✨ Google AI",
    "DOMAIN-SUFFIX,aitestkitchen.withgoogle.com,✨ Google AI",
    "DOMAIN-SUFFIX,fx.google,✨ Google AI",
    "DOMAIN-SUFFIX,idx.dev,✨ Google AI",
    "DOMAIN-SUFFIX,idx.google.com,✨ Google AI",
    "DOMAIN-SUFFIX,firebase.studio,✨ Google AI",
    "DOMAIN-SUFFIX,firebasestudio.google.com,✨ Google AI",
    "DOMAIN-SUFFIX,colab.research.google.com,✨ Google AI",
    "DOMAIN-SUFFIX,colab.google,✨ Google AI",
    "DOMAIN,appsgenaiserver-pa.clients.google.com,✨ Google AI",
    "DOMAIN,appsgenaiserver-pa.clients6.google.com,✨ Google AI",
    "DOMAIN,appsgenaiserver-pa.googleapis.com,✨ Google AI",
    "DOMAIN-SUFFIX,aiplatform.googleapis.com,✨ Google AI",
    "DOMAIN-KEYWORD,aiplatform.googleapis.com,✨ Google AI",
    "DOMAIN-SUFFIX,deepmind.com,✨ Google AI",
    "DOMAIN-SUFFIX,deepmind.google,✨ Google AI",
    "DOMAIN-SUFFIX,gemma.ai,✨ Google AI",
    "RULE-SET,google_deepmind,✨ Google AI",

    // === [4] Google 核心鉴权与区域保护（防止掉入香港大流量或 @cn 直连导致 Google AI 锁区） ===
    "DOMAIN-SUFFIX,accounts.google.com,🔍 Google 服务",
    "DOMAIN-SUFFIX,myaccount.google.com,🔍 Google 服务",
    "DOMAIN-SUFFIX,ogs.google.com,🔍 Google 服务",
    "DOMAIN,oauth2.googleapis.com,🔍 Google 服务",
    "DOMAIN,www.googleapis.com,🔍 Google 服务",
    "DOMAIN,iamcredentials.googleapis.com,🔍 Google 服务",
    "DOMAIN,sts.googleapis.com,🔍 Google 服务",
    "DOMAIN,people.googleapis.com,🔍 Google 服务",
    "DOMAIN,content.googleapis.com,🔍 Google 服务",
    "DOMAIN,play.googleapis.com,🔍 Google 服务",
    "DOMAIN-SUFFIX,apis.google.com,🔍 Google 服务",
    "DOMAIN-SUFFIX,clients6.google.com,🔍 Google 服务",
    "DOMAIN,clients.google.com,🔍 Google 服务",
    "DOMAIN,signaler-pa.clients6.google.com,🔍 Google 服务",
    "DOMAIN,waa-pa.clients6.google.com,🔍 Google 服务",
    "DOMAIN-SUFFIX,recaptcha.net,🔍 Google 服务",
    "DOMAIN-SUFFIX,csp.withgoogle.com,🔍 Google 服务",

    // === [5] 全网大流量下载、HF 模型、镜像、包管理与 Google 纯下载/视频剥离 -> ⬇️ 下载专用 (📦 大流量节点) ===
    // Hugging Face (含 XetHub 存储后端与 LFS 全球边缘节点)
    "RULE-SET,huggingface,⬇️ 下载专用",
    "DOMAIN-SUFFIX,huggingface.co,⬇️ 下载专用",
    "DOMAIN-SUFFIX,hf.co,⬇️ 下载专用",
    "DOMAIN-SUFFIX,hf.space,⬇️ 下载专用",
    "DOMAIN-SUFFIX,huggingface.tech,⬇️ 下载专用",
    "DOMAIN-SUFFIX,xethub.hf.co,⬇️ 下载专用",
    "DOMAIN-SUFFIX,xethub-eu.hf.co,⬇️ 下载专用",
    "DOMAIN,cas-server.xethub.hf.co,⬇️ 下载专用",
    "DOMAIN,cas-server.xethub-eu.hf.co,⬇️ 下载专用",
    "DOMAIN,cas-bridge.xethub.hf.co,⬇️ 下载专用",
    "DOMAIN,transfer.xethub.hf.co,⬇️ 下载专用",
    "DOMAIN,transfer.xethub-eu.hf.co,⬇️ 下载专用",
    "DOMAIN,cdn-lfs.hf.co,⬇️ 下载专用",
    "DOMAIN,cdn-lfs-us-1.hf.co,⬇️ 下载专用",
    "DOMAIN,cdn-lfs-eu-1.hf.co,⬇️ 下载专用",
    "DOMAIN,us.aws.cdn.hf.co,⬇️ 下载专用",
    "DOMAIN,us.gcp.cdn.hf.co,⬇️ 下载专用",
    // Civitai / Ollama / Kaggle / TFHub / Replicate 模型权重下载
    "DOMAIN-SUFFIX,civitai.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,civitai.red,⬇️ 下载专用",
    "DOMAIN-SUFFIX,civitai-cdn.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,ollama.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,ollama.ai,⬇️ 下载专用",
    "DOMAIN,dd20bb891979d25aebc8bec07b2b3bbc.r2.cloudflarestorage.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,replicate.delivery,⬇️ 下载专用",
    "DOMAIN-SUFFIX,tfhub.dev,⬇️ 下载专用",
    "DOMAIN,download.tensorflow.google.com,⬇️ 下载专用",
    "DOMAIN,download.mlcc.google.com,⬇️ 下载专用",
    "RULE-SET,kaggle,⬇️ 下载专用",
    "DOMAIN-SUFFIX,kaggleusercontent.com,⬇️ 下载专用",
    // Google 纯安装包下载 / 云存储 / Drive 大文件 / YouTube 4K 视频流剥离
    "DOMAIN,dl.google.com,⬇️ 下载专用",
    "DOMAIN,dl-ssl.google.com,⬇️ 下载专用",
    "DOMAIN,dl.l.google.com,⬇️ 下载专用",
    "DOMAIN,c.pack.google.com,⬇️ 下载专用",
    "DOMAIN,cache.pack.google.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,gvt1.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,gvt2.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,gvt3.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,xn--ngstr-lra8j.com,⬇️ 下载专用",
    "DOMAIN,storage.googleapis.com,⬇️ 下载专用",
    "DOMAIN,storage.cloud.google.com,⬇️ 下载专用",
    "DOMAIN,drive.usercontent.google.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,gcr.io,⬇️ 下载专用",
    "DOMAIN-SUFFIX,pkg.dev,⬇️ 下载专用",
    "DOMAIN-SUFFIX,googlevideo.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,ytimg.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,ggpht.com,⬇️ 下载专用",
    "RULE-SET,youtube,⬇️ 下载专用",
    // GitHub Release / Raw / LFS / GHCR 容器镜像下载
    "DOMAIN,objects.githubusercontent.com,⬇️ 下载专用",
    "DOMAIN,release-assets.githubusercontent.com,⬇️ 下载专用",
    "DOMAIN,raw.githubusercontent.com,⬇️ 下载专用",
    "DOMAIN,codeload.github.com,⬇️ 下载专用",
    "DOMAIN,media.githubusercontent.com,⬇️ 下载专用",
    "DOMAIN,lfs.github.com,⬇️ 下载专用",
    "DOMAIN,github-cloud.s3.amazonaws.com,⬇️ 下载专用",
    "DOMAIN,pkg-containers.githubusercontent.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,ghcr.io,⬇️ 下载专用",
    // Docker / K8s / 语言依赖包 (PyPI/Conda/npm/Cargo/Go) / OpenVSX & VSCode 插件下载
    "RULE-SET,docker,⬇️ 下载专用",
    "DOMAIN,production.cloudflare.docker.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,quay.io,⬇️ 下载专用",
    "DOMAIN-SUFFIX,k8s.io,⬇️ 下载专用",
    "DOMAIN-SUFFIX,pypi.org,⬇️ 下载专用",
    "DOMAIN-SUFFIX,pythonhosted.org,⬇️ 下载专用",
    "DOMAIN-SUFFIX,anaconda.org,⬇️ 下载专用",
    "DOMAIN-SUFFIX,anaconda.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,npmjs.org,⬇️ 下载专用",
    "DOMAIN-SUFFIX,npmjs.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,yarnpkg.com,⬇️ 下载专用",
    "DOMAIN-SUFFIX,crates.io,⬇️ 下载专用",
    "DOMAIN,proxy.golang.org,⬇️ 下载专用",
    "DOMAIN,sum.golang.org,⬇️ 下载专用",
    "DOMAIN-SUFFIX,open-vsx.org,⬇️ 下载专用",
    "DOMAIN-SUFFIX,vsassets.io,⬇️ 下载专用",
    "DOMAIN,marketplace.visualstudio.com,⬇️ 下载专用",
    "DOMAIN,update.code.visualstudio.com,⬇️ 下载专用",
    "DOMAIN,download.visualstudio.microsoft.com,⬇️ 下载专用",
    "DOMAIN,az764295.vo.msecnd.net,⬇️ 下载专用",
    // Steam：国内 CDN 直连满速，海外资源走大流量下载
    "RULE-SET,steam_cn,🎯 全球直连",
    "RULE-SET,steam,⬇️ 下载专用",

    // === [6] 各大海外 AI 独立拆分 ===
    // Claude (Anthropic / Claude Code / MCP)
    "DOMAIN-SUFFIX,anthropic.com,🟠 Claude",
    "DOMAIN-SUFFIX,claude.ai,🟠 Claude",
    "DOMAIN-SUFFIX,claude.com,🟠 Claude",
    "DOMAIN-SUFFIX,claude.app,🟠 Claude",
    "DOMAIN-SUFFIX,claude.dev,🟠 Claude",
    "DOMAIN-SUFFIX,antspace.dev,🟠 Claude",
    "DOMAIN-SUFFIX,claudeusercontent.com,🟠 Claude",
    "DOMAIN-SUFFIX,claudemcpclient.com,🟠 Claude",
    "DOMAIN-SUFFIX,claudemcpcontent.com,🟠 Claude",
    "DOMAIN,servd-anthropic-website.b-cdn.net,🟠 Claude",
    "RULE-SET,anthropic,🟠 Claude",

    // OpenAI (ChatGPT / Sora / API / LiveKit 语音)
    "DOMAIN-SUFFIX,openai.com,🟢 OpenAI",
    "DOMAIN-SUFFIX,chatgpt.com,🟢 OpenAI",
    "DOMAIN-SUFFIX,sora.com,🟢 OpenAI",
    "DOMAIN-SUFFIX,oaistatic.com,🟢 OpenAI",
    "DOMAIN-SUFFIX,oaiusercontent.com,🟢 OpenAI",
    "DOMAIN-SUFFIX,chatgpt.livekit.cloud,🟢 OpenAI",
    "DOMAIN-SUFFIX,host.livekit.cloud,🟢 OpenAI",
    "DOMAIN-SUFFIX,turn.livekit.cloud,🟢 OpenAI",
    "DOMAIN,openai-api.arkoselabs.com,🟢 OpenAI",
    "DOMAIN-SUFFIX,client-api.arkoselabs.com,🟢 OpenAI",
    "DOMAIN-KEYWORD,openaicom-api,🟢 OpenAI",
    "RULE-SET,openai,🟢 OpenAI",

    // AI 编程助手 (Cursor / Windsurf / Copilot / JetBrains AI / CodeRabbit / Cline / Devin)
    "RULE-SET,cursor,💻 AI 编程",
    "RULE-SET,windsurf,💻 AI 编程",
    "RULE-SET,github_copilot,💻 AI 编程",
    "RULE-SET,jetbrains_ai,💻 AI 编程",
    "DOMAIN-SUFFIX,coderabbit.ai,💻 AI 编程",
    "DOMAIN-SUFFIX,devin.ai,💻 AI 编程",
    "DOMAIN-SUFFIX,cline.bot,💻 AI 编程",
    "DOMAIN-SUFFIX,opencode.ai,💻 AI 编程",
    "DOMAIN-SUFFIX,kiro.dev,💻 AI 编程",
    "DOMAIN-SUFFIX,v0.dev,💻 AI 编程",
    "DOMAIN-SUFFIX,v0.app,💻 AI 编程",
    "DOMAIN-SUFFIX,bolt.new,💻 AI 编程",
    "DOMAIN-SUFFIX,lovable.dev,💻 AI 编程",

    // 其他 AI 平台 (xAI Grok / Perplexity / Microsoft Copilot / OpenRouter / Poe / Groq 等)
    "RULE-SET,xai,🤖 其他 AI",
    "RULE-SET,perplexity,🤖 其他 AI",
    "DOMAIN-SUFFIX,copilot.microsoft.com,🤖 其他 AI",
    "DOMAIN-SUFFIX,copilot.cloud.microsoft,🤖 其他 AI",
    "DOMAIN,sydney.bing.com,🤖 其他 AI",
    "DOMAIN-SUFFIX,openrouter.ai,🤖 其他 AI",
    "DOMAIN-SUFFIX,poe.com,🤖 其他 AI",
    "DOMAIN-SUFFIX,groq.com,🤖 其他 AI",
    "DOMAIN-SUFFIX,cerebras.ai,🤖 其他 AI",
    "DOMAIN-SUFFIX,mistral.ai,🤖 其他 AI",
    "DOMAIN-SUFFIX,together.ai,🤖 其他 AI",
    "DOMAIN-SUFFIX,fireworks.ai,🤖 其他 AI",
    "DOMAIN-SUFFIX,deepinfra.com,🤖 其他 AI",
    "DOMAIN-SUFFIX,midjourney.com,🤖 其他 AI",
    "DOMAIN-SUFFIX,elevenlabs.io,🤖 其他 AI",
    "RULE-SET,category_ai_not_cn,🤖 其他 AI",

    // === [7] Google 剩余全域名与 IP 隔离（排在 cn_domain 之前，防止 google@cn 直连泄露国内 IP） ===
    "RULE-SET,google_domain,🔍 Google 服务",
    "RULE-SET,google_ip,🔍 Google 服务,no-resolve",

    // === [8] 国内常见服务直连 ===
    "RULE-SET,apple_cn,🎯 全球直连",
    "RULE-SET,microsoft_cn,🎯 全球直连",
    "RULE-SET,cn_domain,🎯 全球直连",

    // === [9] 国外常规流量统一走【📦 大流量节点】 ===
    "RULE-SET,github,📦 大流量节点",
    "RULE-SET,telegram_domain,📦 大流量节点",
    "RULE-SET,telegram_ip,📦 大流量节点,no-resolve",
    "RULE-SET,geolocation_not_cn,📦 大流量节点",
    "RULE-SET,cn_ip,🎯 全球直连,no-resolve",
    "MATCH,📦 大流量节点",
  ];

  return config;
}
