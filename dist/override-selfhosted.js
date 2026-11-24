/**
 * 自动生成的自托管版 Clash Verge Rev / Mihomo Party 扩展脚本
 * 规则源仓库: https://github.com/null0so/clash-rules (每日 GitHub Actions 自动去重构建)
 */
function main(config) {
  const BASE = "https://testingcf.jsdelivr.net/gh/null0so/clash-rules@main/dist/ruleset";
  const NO_INFO = "(?i)剩余|到期|官网|套餐|重置|群组|频道";
  const AI_SAFE = "(?i)港|HK|Hong\\s?Kong|澳门|MO|Macao|俄|RU|Russia|中国|CN|剩余|到期|官网|套餐|重置|群组|频道";
  const HIGH_TRAFFIC_EX = "(?i)高倍率|[2-9](\\.\\d+)?[xX倍]|家宽|住宅|原生|剩余|到期|官网|套餐|重置|群组|频道";

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
    "proxy-server-nameserver": ["https://223.5.5.5/dns-query", "https://120.53.53.53/dns-query"],
    "nameserver-policy": {
      "rule-set:private_domain,cn_domain": ["https://223.5.5.5/dns-query", "https://120.53.53.53/dns-query"],
    },
    nameserver: ["https://dns.google/dns-query", "https://cloudflare-dns.com/dns-query"],
  });

  if (config["tun"]) {
    const ex = new Set(config["tun"]["route-exclude-address"] || []);
    ex.add("127.0.0.0/8");
    ex.add("::1/128");
    config["tun"]["route-exclude-address"] = Array.from(ex);
  }

  config["proxy-groups"] = [
    { name: "📦 大流量节点", type: "select", proxies: ["⚡ 大流量自动优选"], "include-all": true, "exclude-filter": NO_INFO },
    { name: "⬇️ 下载专用", type: "select", proxies: ["📦 大流量节点", "⚡ 大流量自动优选", "🎯 全球直连"], "include-all": true, "exclude-filter": NO_INFO },
    { name: "🌌 Google Antigravity", type: "select", "include-all": true, "exclude-filter": AI_SAFE, proxies: ["📦 大流量节点"] },
    { name: "✨ Google AI", type: "select", proxies: ["🌌 Google Antigravity"], "include-all": true, "exclude-filter": AI_SAFE },
    { name: "🔍 Google 服务", type: "select", proxies: ["✨ Google AI", "🌌 Google Antigravity", "📦 大流量节点"], "include-all": true, "exclude-filter": NO_INFO },
    { name: "🟠 Claude", type: "select", "include-all": true, "exclude-filter": AI_SAFE, proxies: ["🌌 Google Antigravity", "📦 大流量节点"] },
    { name: "🟢 OpenAI", type: "select", "include-all": true, "exclude-filter": AI_SAFE, proxies: ["🌌 Google Antigravity", "📦 大流量节点"] },
    { name: "💻 AI 编程", type: "select", proxies: ["🌌 Google Antigravity", "🟠 Claude", "🟢 OpenAI", "📦 大流量节点"], "include-all": true, "exclude-filter": AI_SAFE },
    { name: "🤖 其他 AI", type: "select", proxies: ["✨ Google AI", "🟢 OpenAI", "🟠 Claude", "📦 大流量节点"], "include-all": true, "exclude-filter": AI_SAFE },
    { name: "⚡ 大流量自动优选", type: "url-test", url: "https://www.gstatic.com/generate_204", interval: 300, tolerance: 50, lazy: true, "include-all": true, "exclude-filter": HIGH_TRAFFIC_EX },
    { name: "🎯 全球直连", type: "select", proxies: ["DIRECT", "📦 大流量节点"] },
  ];

  const dom = (n) => ({ type: "http", behavior: "domain", format: "mrs", url: `${BASE}/${n}.mrs`, path: `./ruleset/${n}.mrs`, interval: 86400 });
  const ip = (n) => ({ type: "http", behavior: "ipcidr", format: "mrs", url: `${BASE}/${n}.mrs`, path: `./ruleset/${n}.mrs`, interval: 86400 });

  config["rule-providers"] = {
    private_domain: dom("private_domain"),
    private_ip: ip("private_ip"),
    google_antigravity: dom("google_antigravity"),
    google_ai: dom("google_ai"),
    google_auth: dom("google_auth"),
    downloads: dom("downloads"),
    steam_cn: dom("steam_cn"),
    steam: dom("steam"),
    claude: dom("claude"),
    openai: dom("openai"),
    ai_coding: dom("ai_coding"),
    ai_others: dom("ai_others"),
    google_service: dom("google_service"),
    google_ip: ip("google_ip"),
    apple_cn: dom("apple_cn"),
    microsoft_cn: dom("microsoft_cn"),
    cn_domain: dom("cn_domain"),
    github: dom("github"),
    telegram_domain: dom("telegram_domain"),
    telegram_ip: ip("telegram_ip"),
    geolocation_not_cn: dom("geolocation_not_cn"),
    cn_ip: ip("cn_ip"),
  };

  config["rules"] = [
    "DOMAIN,localhost,DIRECT",
    "DOMAIN-SUFFIX,local,DIRECT",
    "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR6,::1/128,DIRECT,no-resolve",
    "RULE-SET,private_domain,DIRECT",
    "RULE-SET,private_ip,DIRECT,no-resolve",
    // 保底关键字补充（覆盖极少数动态区域前缀如 us-central1-aiplatform.googleapis.com）
    "DOMAIN-KEYWORD,cloudcode-pa,🌌 Google Antigravity",
    "RULE-SET,google_antigravity,🌌 Google Antigravity",
    "DOMAIN-KEYWORD,aiplatform.googleapis.com,✨ Google AI",
    "RULE-SET,google_ai,✨ Google AI",
    "RULE-SET,google_auth,🔍 Google 服务",
    "RULE-SET,downloads,⬇️ 下载专用",
    "RULE-SET,steam_cn,🎯 全球直连",
    "RULE-SET,steam,⬇️ 下载专用",
    "RULE-SET,claude,🟠 Claude",
    "RULE-SET,openai,🟢 OpenAI",
    "RULE-SET,ai_coding,💻 AI 编程",
    "RULE-SET,ai_others,🤖 其他 AI",
    "RULE-SET,google_service,🔍 Google 服务",
    "RULE-SET,google_ip,🔍 Google 服务,no-resolve",
    "RULE-SET,apple_cn,🎯 全球直连",
    "RULE-SET,microsoft_cn,🎯 全球直连",
    "RULE-SET,cn_domain,🎯 全球直连",
    "RULE-SET,github,📦 大流量节点",
    "RULE-SET,telegram_domain,📦 大流量节点",
    "RULE-SET,telegram_ip,📦 大流量节点,no-resolve",
    "RULE-SET,geolocation_not_cn,📦 大流量节点",
    "RULE-SET,cn_ip,🎯 全球直连,no-resolve",
    "MATCH,📦 大流量节点",
  ];
  return config;
}
