#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Clash / Mihomo 分流规则每日自动拉取、多维去重与 .mrs 编译脚本 (零第三方依赖)

核心去重与优化能力：
1. 域名精确去重与规范化：统一转小写、去除首尾空白/末尾点号/注释/无效字符、剔除 @ads 广告追踪条目。
2. 父子域名后缀树收敛 (Suffix-Trie Pruning)：
   - 若存在 `+.hf.co` (即 DOMAIN-SUFFIX,hf.co)，自动剔除冗余子后缀 `+.xethub.hf.co` 及子域名 `cdn-lfs.hf.co` 等。
3. 跨分组优先级差集去重 (Cross-Group Priority Subtraction)：
   - 按分流匹配优先级自上而下构建，自动从低优先级聚合组（如 `google_service`、`ai_others`）中剔除已被高优先级组
     （如 `google_antigravity`、`google_ai`、`downloads`）100% 覆盖的域名或后缀，彻底消除跨文件重复。
4. IPv4 / IPv6 CIDR 网段数学合并去重 (`ipaddress.collapse_addresses`)：
   - 自动去重重复 IP、剔除已被大网段包含的子网（如 `/24` 包含 `/32`），并将相邻连续网段合并为超网。
5. 自动编译与自托管配置生成：
   - 若环境中存在 `mihomo` 二进制（GitHub Actions 自动安装），自动编译生成高性能 `.mrs` 文件。
   - 自动读取 `GITHUB_REPOSITORY` 环境变量，在 `dist/` 下生成指向你个人仓库 jsDelivr CDN 的一键 `override-selfhosted.js` 与 `config-selfhosted.yaml`。
"""

from __future__ import annotations

import concurrent.futures
import datetime as dt
import ipaddress
import os
import re
import shutil
import subprocess
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, List, Optional, Sequence, Set, Tuple

ROOT_DIR = Path(__file__).resolve().parent.parent
LOCAL_RULES_DIR = ROOT_DIR / "rules"
DIST_DIR = ROOT_DIR / "dist"
DIST_RULESET_DIR = DIST_DIR / "ruleset"

UPSTREAM_GEOSITE = "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite"
UPSTREAM_GEOIP = "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip"

DOMAIN_CHARS_RE = re.compile(r"^[a-z0-9._-]+$")


def normalize_domain(raw: str) -> Optional[str]:
    d = raw.strip().lower().strip(".")
    if not d or " " in d or "/" in d or ":" in d:
        return None
    if not DOMAIN_CHARS_RE.match(d):
        return None
    return d


def parent_domains(domain: str) -> List[str]:
    """返回从自身到顶级的父域名链，例如 'a.b.com' -> ['a.b.com', 'b.com', 'com']"""
    parts = domain.split(".")
    return [".".join(parts[i:]) for i in range(len(parts))]


@dataclass
class DomainStats:
    raw_lines: int = 0
    exact_before: int = 0
    suffix_before: int = 0
    pruned_intra: int = 0
    pruned_cross: int = 0
    exact_after: int = 0
    suffix_after: int = 0


class DomainSet:
    """支持父子后缀树收敛与跨组差集剔除的域名集合"""

    def __init__(self) -> None:
        self.exact: Set[str] = set()
        self.suffixes: Set[str] = set()
        self.keywords: Set[str] = set()
        self.raw_count: int = 0

    def add_exact(self, domain: str) -> None:
        d = normalize_domain(domain)
        if d:
            self.raw_count += 1
            self.exact.add(d)

    def add_suffix(self, domain: str) -> None:
        d = normalize_domain(domain)
        if d:
            self.raw_count += 1
            self.suffixes.add(d)

    def add_keyword(self, kw: str) -> None:
        k = kw.strip().lower()
        if k:
            self.raw_count += 1
            self.keywords.add(k)

    def covers_exact(self, domain: str) -> bool:
        if domain in self.exact:
            return True
        for p in parent_domains(domain):
            if p in self.suffixes:
                return True
        return False

    def covers_suffix(self, suffix: str) -> bool:
        for p in parent_domains(suffix):
            if p in self.suffixes:
                return True
        return False

    def deduplicate_and_subtract(self, higher_priority_sets: Sequence["DomainSet"]) -> DomainStats:
        stats = DomainStats(
            raw_lines=self.raw_count,
            exact_before=len(self.exact),
            suffix_before=len(self.suffixes),
        )

        # 1. 组内父子域名后缀树收敛 (Intra-group Suffix-Trie Pruning)
        kept_suffixes: Set[str] = set()
        for s in self.suffixes:
            # 若严格父域名已在当前 suffixes 中，则子后缀冗余
            strict_parents = parent_domains(s)[1:]
            if any(p in self.suffixes for p in strict_parents):
                stats.pruned_intra += 1
            else:
                kept_suffixes.add(s)

        kept_exact: Set[str] = set()
        for d in self.exact:
            # 若自身或任一父域名已在 kept_suffixes 中，则该精确域名冗余
            if any(p in kept_suffixes for p in parent_domains(d)):
                stats.pruned_intra += 1
            else:
                kept_exact.add(d)

        self.suffixes = kept_suffixes
        self.exact = kept_exact

        # 2. 跨高优先级策略组差集剔除 (Cross-group Priority Subtraction)
        if higher_priority_sets:
            final_suffixes: Set[str] = set()
            for s in self.suffixes:
                if any(hp.covers_suffix(s) for hp in higher_priority_sets):
                    stats.pruned_cross += 1
                else:
                    final_suffixes.add(s)

            final_exact: Set[str] = set()
            for d in self.exact:
                if any(hp.covers_exact(d) for hp in higher_priority_sets):
                    stats.pruned_cross += 1
                else:
                    final_exact.add(d)

            self.suffixes = final_suffixes
            self.exact = final_exact

        stats.exact_after = len(self.exact)
        stats.suffix_after = len(self.suffixes)
        return stats

    def to_mihomo_text_lines(self) -> List[str]:
        """输出 Mihomo behavior: domain 标准格式 (+.suffix 与 exact)"""
        lines = [f"+.{s}" for s in sorted(self.suffixes)]
        lines.extend(sorted(self.exact))
        return lines

    def to_clash_domain_yaml_lines(self) -> List[str]:
        lines = ["payload:"]
        for item in self.to_mihomo_text_lines():
            lines.append(f"  - '{item}'")
        return lines


@dataclass
class IPStats:
    raw_lines: int = 0
    before_collapse: int = 0
    after_collapse: int = 0


class IPSet:
    """支持 IPv4 / IPv6 网段去重与超网聚合的 IP 集合"""

    def __init__(self) -> None:
        self.v4: List[ipaddress.IPv4Network] = []
        self.v6: List[ipaddress.IPv6Network] = []
        self.raw_count: int = 0

    def add_cidr(self, raw: str) -> None:
        s = raw.strip()
        if not s:
            return
        # 剥离如 ',no-resolve' 尾部参数
        s = s.split(",")[0].strip()
        try:
            net = ipaddress.ip_network(s, strict=False)
            self.raw_count += 1
            if isinstance(net, ipaddress.IPv4Network):
                self.v4.append(net)
            else:
                self.v6.append(net)
        except ValueError:
            pass

    def collapse(self) -> IPStats:
        before = len(set(self.v4)) + len(set(self.v6))
        self.v4 = list(ipaddress.collapse_addresses(self.v4))
        self.v6 = list(ipaddress.collapse_addresses(self.v6))
        after = len(self.v4) + len(self.v6)
        return IPStats(raw_lines=self.raw_count, before_collapse=before, after_collapse=after)

    def to_text_lines(self) -> List[str]:
        lines = [str(n) for n in self.v4] + [str(n) for n in self.v6]
        return lines or ["0.0.0.0/32"]

    def to_yaml_lines(self) -> List[str]:
        lines = ["payload:"]
        for cidr in self.to_text_lines():
            lines.append(f"  - '{cidr}'")
        return lines


def parse_lines_into_sets(lines: Iterable[str], dset: Optional[DomainSet] = None, ipset: Optional[IPSet] = None) -> None:
    """兼容解析 Clash YAML / Classical List / Mihomo .list / 纯域名 / 纯 CIDR 多种规则格式"""
    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or line == "payload:":
            continue
        # 去除行内注释
        if " #" in line:
            line = line.split(" #", 1)[0].strip()
        # 跳过包含 @ads 的上游广告追踪条目
        if "@ads" in line:
            continue
        if " @" in line:
            line = line.split(" @", 1)[0].strip()

        # 去除 YAML 列表前缀 "- " 与引号
        if line.startswith("-"):
            line = line[1:].strip().strip("'").strip('"')
        else:
            line = line.strip("'").strip('"')

        if not line:
            continue

        upper = line.upper()
        if upper.startswith("DOMAIN-SUFFIX,"):
            if dset is not None:
                dset.add_suffix(line.split(",", 1)[1].split(",")[0])
        elif upper.startswith("DOMAIN,"):
            if dset is not None:
                dset.add_exact(line.split(",", 1)[1].split(",")[0])
        elif upper.startswith("DOMAIN-KEYWORD,"):
            if dset is not None:
                dset.add_keyword(line.split(",", 1)[1].split(",")[0])
        elif upper.startswith(("IP-CIDR,", "IP-CIDR6,")):
            if ipset is not None:
                ipset.add_cidr(line.split(",", 1)[1])
        elif line.startswith("+."):
            if dset is not None:
                dset.add_suffix(line[2:])
        elif line.startswith("."):
            if dset is not None:
                dset.add_suffix(line[1:])
        elif line.startswith("*."):
            # 在构建简洁 domain 集合时，*.example.com 按后缀收敛或忽略单级差异处理为后缀
            if dset is not None:
                dset.add_suffix(line[2:])
        else:
            # 判断是 CIDR/IP 还是裸域名
            if ipset is not None and ("/" in line or ":" in line or re.match(r"^\d+\.\d+\.\d+\.\d+$", line)):
                ipset.add_cidr(line)
            elif dset is not None:
                dset.add_exact(line)


def fetch_url(url: str, timeout: int = 30) -> List[str]:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "clash-rules-autobuilder/1.0"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    return text.splitlines()


@dataclass
class DomainTask:
    name: str
    group_label: str
    local_files: List[str] = field(default_factory=list)
    upstream_geosites: List[str] = field(default_factory=list)
    subtract_from: List[str] = field(default_factory=list)


@dataclass
class IPTask:
    name: str
    local_files: List[str] = field(default_factory=list)
    upstream_geoips: List[str] = field(default_factory=list)


DOMAIN_TASKS: List[DomainTask] = [
    DomainTask(
        name="private_domain",
        group_label="DIRECT",
        upstream_geosites=["private"],
    ),
    DomainTask(
        name="google_antigravity",
        group_label="🌌 Google Antigravity",
        local_files=["google-antigravity.yaml"],
    ),
    DomainTask(
        name="google_ai",
        group_label="✨ Google AI",
        local_files=["google-ai.yaml"],
        upstream_geosites=["google-deepmind"],
        subtract_from=["google_antigravity"],
    ),
    DomainTask(
        name="google_auth",
        group_label="🔍 Google 服务",
        local_files=["google-auth-core.yaml"],
        subtract_from=["google_antigravity", "google_ai"],
    ),
    DomainTask(
        name="downloads",
        group_label="⬇️ 下载专用",
        local_files=["downloads-high-traffic.yaml"],
        upstream_geosites=["huggingface", "kaggle", "docker", "youtube"],
        subtract_from=["google_antigravity", "google_ai", "google_auth"],
    ),
    DomainTask(
        name="steam_cn",
        group_label="🎯 全球直连",
        upstream_geosites=["steam@cn"],
    ),
    DomainTask(
        name="steam",
        group_label="⬇️ 下载专用",
        upstream_geosites=["steam"],
        subtract_from=["steam_cn"],
    ),
    DomainTask(
        name="claude",
        group_label="🟠 Claude",
        local_files=["claude.yaml"],
        upstream_geosites=["anthropic"],
    ),
    DomainTask(
        name="openai",
        group_label="🟢 OpenAI",
        local_files=["openai.yaml"],
        upstream_geosites=["openai"],
    ),
    DomainTask(
        name="ai_coding",
        group_label="💻 AI 编程",
        local_files=["ai-coding.yaml"],
        upstream_geosites=["cursor", "windsurf", "github-copilot", "jetbrains-ai"],
        subtract_from=["google_antigravity", "google_ai", "downloads", "claude", "openai"],
    ),
    DomainTask(
        name="ai_others",
        group_label="🤖 其他 AI",
        local_files=["ai-others.yaml"],
        upstream_geosites=["xai", "perplexity", "category-ai-!cn"],
        # 自动从 category-ai-!cn 中剔除 HuggingFace / Ollama (downloads) 以及已独立拆分的各大 AI！
        subtract_from=["google_antigravity", "google_ai", "downloads", "claude", "openai", "ai_coding"],
    ),
    DomainTask(
        name="google_service",
        group_label="🔍 Google 服务",
        upstream_geosites=["google"],
        # 自动从 google 全集里剔除 Antigravity、Google AI、Google 鉴权以及已剥离到大流量的 YouTube / Google 下载域名！
        subtract_from=["google_antigravity", "google_ai", "google_auth", "downloads"],
    ),
    DomainTask(
        name="apple_cn",
        group_label="🎯 全球直连",
        upstream_geosites=["apple-cn"],
    ),
    DomainTask(
        name="microsoft_cn",
        group_label="🎯 全球直连",
        upstream_geosites=["microsoft@cn"],
        subtract_from=["openai", "ai_coding", "ai_others", "downloads"],
    ),
    DomainTask(
        name="cn_domain",
        group_label="🎯 全球直连",
        upstream_geosites=["cn"],
        # 彻底剔除 cn 中可能污染 Google / AI / 下载的共享域名（如 google@cn）
        subtract_from=[
            "google_antigravity",
            "google_ai",
            "google_auth",
            "google_service",
            "downloads",
            "claude",
            "openai",
            "ai_coding",
            "ai_others",
        ],
    ),
    DomainTask(
        name="github",
        group_label="📦 大流量节点",
        upstream_geosites=["github"],
        subtract_from=["downloads", "ai_coding"],
    ),
    DomainTask(
        name="telegram_domain",
        group_label="📦 大流量节点",
        upstream_geosites=["telegram"],
    ),
    DomainTask(
        name="geolocation_not_cn",
        group_label="📦 大流量节点",
        upstream_geosites=["geolocation-!cn"],
        subtract_from=[
            "google_antigravity",
            "google_ai",
            "google_auth",
            "google_service",
            "downloads",
            "claude",
            "openai",
            "ai_coding",
            "ai_others",
            "github",
            "telegram_domain",
            "cn_domain",
        ],
    ),
]

IP_TASKS: List[IPTask] = [
    IPTask(name="private_ip", upstream_geoips=["private"]),
    IPTask(name="google_ip", upstream_geoips=["google"]),
    IPTask(name="telegram_ip", upstream_geoips=["telegram"]),
    IPTask(name="cn_ip", upstream_geoips=["cn"]),
]


def maybe_compile_mrs(mihomo_bin: Optional[str], behavior: str, list_path: Path, mrs_path: Path) -> bool:
    if not mihomo_bin:
        return False
    subprocess.run(
        [mihomo_bin, "convert-ruleset", behavior, "text", str(list_path), str(mrs_path)],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return True


def generate_selfhosted_configs(repo_slug: str, branch: str, has_mrs: bool) -> None:
    """生成直接引用当前 GitHub 仓库构建产物的自托管 override-selfhosted.js 与 config-selfhosted.yaml"""
    ext = "mrs" if has_mrs else "yaml"
    fmt = "mrs" if has_mrs else "yaml"
    cdn_base = f"https://testingcf.jsdelivr.net/gh/{repo_slug}@{branch}/dist/ruleset"

    override_js = f"""/**
 * 自动生成的自托管版 Clash Verge Rev / Mihomo Party 扩展脚本
 * 规则源仓库: https://github.com/{repo_slug} (每日 GitHub Actions 自动去重构建)
 */
function main(config) {{
  const BASE = "{cdn_base}";
  const NO_INFO = "(?i)剩余|到期|官网|套餐|重置|群组|频道";
  const AI_SAFE = "(?i)港|HK|Hong\\\\s?Kong|澳门|MO|Macao|俄|RU|Russia|中国|CN|剩余|到期|官网|套餐|重置|群组|频道";
  const HIGH_TRAFFIC_EX = "(?i)高倍率|[2-9](\\\\.\\\\d+)?[xX倍]|家宽|住宅|原生|剩余|到期|官网|套餐|重置|群组|频道";

  config["unified-delay"] = true;
  config["tcp-concurrent"] = true;
  config["sniffer"] = {{
    enable: true,
    "force-dns-mapping": true,
    "parse-pure-ip": true,
    "override-destination": false,
    sniff: {{
      HTTP: {{ ports: [80, "8080-8880"], "override-destination": true }},
      TLS: {{ ports: [443, 8443] }},
      QUIC: {{ ports: [443, 8443] }},
    }},
    "skip-domain": ["Mijia Cloud", "+.push.apple.com", "localhost", "+.local"],
  }};

  config["dns"] = Object.assign({{}}, config["dns"] || {{}}, {{
    enable: true,
    ipv6: false,
    "enhanced-mode": "fake-ip",
    "respect-rules": true,
    "default-nameserver": ["223.5.5.5", "119.29.29.29"],
    "proxy-server-nameserver": ["https://223.5.5.5/dns-query", "https://120.53.53.53/dns-query"],
    "nameserver-policy": {{
      "rule-set:private_domain,cn_domain": ["https://223.5.5.5/dns-query", "https://120.53.53.53/dns-query"],
    }},
    nameserver: ["https://dns.google/dns-query", "https://cloudflare-dns.com/dns-query"],
  }});

  if (config["tun"]) {{
    const ex = new Set(config["tun"]["route-exclude-address"] || []);
    ex.add("127.0.0.0/8");
    ex.add("::1/128");
    config["tun"]["route-exclude-address"] = Array.from(ex);
  }}

  config["proxy-groups"] = [
    {{ name: "📦 大流量节点", type: "select", proxies: ["⚡ 大流量自动优选"], "include-all": true, "exclude-filter": NO_INFO }},
    {{ name: "⬇️ 下载专用", type: "select", proxies: ["📦 大流量节点", "⚡ 大流量自动优选", "🎯 全球直连"], "include-all": true, "exclude-filter": NO_INFO }},
    {{ name: "🌌 Google Antigravity", type: "select", "include-all": true, "exclude-filter": AI_SAFE, proxies: ["📦 大流量节点"] }},
    {{ name: "✨ Google AI", type: "select", proxies: ["🌌 Google Antigravity"], "include-all": true, "exclude-filter": AI_SAFE }},
    {{ name: "🔍 Google 服务", type: "select", proxies: ["✨ Google AI", "🌌 Google Antigravity", "📦 大流量节点"], "include-all": true, "exclude-filter": NO_INFO }},
    {{ name: "🟠 Claude", type: "select", "include-all": true, "exclude-filter": AI_SAFE, proxies: ["🌌 Google Antigravity", "📦 大流量节点"] }},
    {{ name: "🟢 OpenAI", type: "select", "include-all": true, "exclude-filter": AI_SAFE, proxies: ["🌌 Google Antigravity", "📦 大流量节点"] }},
    {{ name: "💻 AI 编程", type: "select", proxies: ["🌌 Google Antigravity", "🟠 Claude", "🟢 OpenAI", "📦 大流量节点"], "include-all": true, "exclude-filter": AI_SAFE }},
    {{ name: "🤖 其他 AI", type: "select", proxies: ["✨ Google AI", "🟢 OpenAI", "🟠 Claude", "📦 大流量节点"], "include-all": true, "exclude-filter": AI_SAFE }},
    {{ name: "⚡ 大流量自动优选", type: "url-test", url: "https://www.gstatic.com/generate_204", interval: 300, tolerance: 50, lazy: true, "include-all": true, "exclude-filter": HIGH_TRAFFIC_EX }},
    {{ name: "🎯 全球直连", type: "select", proxies: ["DIRECT", "📦 大流量节点"] }},
  ];

  const dom = (n) => ({{ type: "http", behavior: "domain", format: "{fmt}", url: `${{BASE}}/${{n}}.{ext}`, path: `./ruleset/${{n}}.{ext}`, interval: 86400 }});
  const ip = (n) => ({{ type: "http", behavior: "ipcidr", format: "{fmt}", url: `${{BASE}}/${{n}}.{ext}`, path: `./ruleset/${{n}}.{ext}`, interval: 86400 }});

  config["rule-providers"] = {{
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
  }};

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
}}
"""
    (DIST_DIR / "override-selfhosted.js").write_text(override_js, encoding="utf-8")


def main() -> None:
    DIST_RULESET_DIR.mkdir(parents=True, exist_ok=True)
    mihomo_bin = shutil.which("mihomo")

    # 1. 并发拉取所有需要的上游 .list 源文件，大幅提速
    needed_geosites = {g for t in DOMAIN_TASKS for g in t.upstream_geosites}
    needed_geoips = {g for t in IP_TASKS for g in t.upstream_geoips}

    url_map = {
        **{("geosite", g): f"{UPSTREAM_GEOSITE}/{g}.list" for g in needed_geosites},
        **{("geoip", g): f"{UPSTREAM_GEOIP}/{g}.list" for g in needed_geoips},
    }

    fetched: dict[Tuple[str, str], List[str]] = {}
    print(f"[1/4] 正在并发拉取 {len(url_map)} 个 GitHub 上游规则集...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        future_to_key = {pool.submit(fetch_url, url): key for key, url in url_map.items()}
        for fut in concurrent.futures.as_completed(future_to_key):
            key = future_to_key[fut]
            fetched[key] = fut.result()

    # 2. 按优先级构建、收敛去重与跨组差集剔除所有域名规则集
    print("[2/4] 正在执行父子域名树收敛去重与跨分组差集剔除...")
    built_domains: dict[str, DomainSet] = {}
    domain_reports: List[Tuple[DomainTask, DomainStats]] = []

    for task in DOMAIN_TASKS:
        dset = DomainSet()
        for lf in task.local_files:
            p = LOCAL_RULES_DIR / lf
            if p.exists():
                parse_lines_into_sets(p.read_text(encoding="utf-8").splitlines(), dset=dset)
        for gs in task.upstream_geosites:
            parse_lines_into_sets(fetched[("geosite", gs)], dset=dset)

        higher_sets = [built_domains[name] for name in task.subtract_from if name in built_domains]
        stats = dset.deduplicate_and_subtract(higher_sets)
        built_domains[task.name] = dset
        domain_reports.append((task, stats))

        list_path = DIST_RULESET_DIR / f"{task.name}.list"
        yaml_path = DIST_RULESET_DIR / f"{task.name}.yaml"
        mrs_path = DIST_RULESET_DIR / f"{task.name}.mrs"

        list_lines = dset.to_mihomo_text_lines() or ["invalid.local"]
        list_path.write_text("\n".join(list_lines) + "\n", encoding="utf-8")
        yaml_path.write_text("\n".join(dset.to_clash_domain_yaml_lines()) + "\n", encoding="utf-8")
        maybe_compile_mrs(mihomo_bin, "domain", list_path, mrs_path)

    # 3. 执行 IPv4 / IPv6 CIDR 网段聚合与去重
    print("[3/4] 正在执行 IPv4 / IPv6 CIDR 网段去重与超网合并...")
    ip_reports: List[Tuple[IPTask, IPStats]] = []
    for task in IP_TASKS:
        ipset = IPSet()
        for lf in task.local_files:
            p = LOCAL_RULES_DIR / lf
            if p.exists():
                parse_lines_into_sets(p.read_text(encoding="utf-8").splitlines(), ipset=ipset)
        for gi in task.upstream_geoips:
            parse_lines_into_sets(fetched[("geoip", gi)], ipset=ipset)
        istats = ipset.collapse()
        ip_reports.append((task, istats))

        list_path = DIST_RULESET_DIR / f"{task.name}.list"
        yaml_path = DIST_RULESET_DIR / f"{task.name}.yaml"
        mrs_path = DIST_RULESET_DIR / f"{task.name}.mrs"

        list_path.write_text("\n".join(ipset.to_text_lines()) + "\n", encoding="utf-8")
        yaml_path.write_text("\n".join(ipset.to_yaml_lines()) + "\n", encoding="utf-8")
        maybe_compile_mrs(mihomo_bin, "ipcidr", list_path, mrs_path)

    # 4. 生成构建去重统计报告与自托管脚本
    print("[4/4] 正在生成去重统计报告与自托管脚本...")
    repo_slug = os.environ.get("GITHUB_REPOSITORY", "null0so/clash-rules")
    branch = os.environ.get("GITHUB_REF_NAME", "main")
    generate_selfhosted_configs(repo_slug, branch, has_mrs=bool(mihomo_bin))

    now_utc = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    report_lines = [
        "# 规则集自动去重与编译报告",
        "",
        f"- **更新时间**：`{now_utc}`",
        f"- **Mihomo `.mrs` 二进制编译**：`{'已启用' if mihomo_bin else '未检测到 mihomo CLI（已输出 .list 与 .yaml）'}`",
        "",
        "## 一、 域名规则集去重明细（后缀树收敛 + 跨分组差集剔除）",
        "",
        "| 规则集 | 目标策略组 | 原始读入条数 | 组内父子收敛剔除 | 跨组高优覆盖剔除 | 最终精简条数 (`+.后缀` / `精确`) |",
        "| :--- | :--- | ---: | ---: | ---: | ---: |",
    ]
    for task, st in domain_reports:
        total_after = st.suffix_after + st.exact_after
        report_lines.append(
            f"| `{task.name}` | {task.group_label} | {st.raw_lines} | -{st.pruned_intra} | -{st.pruned_cross} | **{total_after}** (`{st.suffix_after}` / `{st.exact_after}`) |"
        )

    report_lines.extend([
        "",
        "## 二、 IP / CIDR 网段合并去重明细（`ipaddress.collapse_addresses`）",
        "",
        "| 规则集 | 原始读入网段 | 精确去重后 | 超网合并收敛后 | 压缩精简条数 |",
        "| :--- | ---: | ---: | ---: | ---: |",
    ])
    for task, ist in ip_reports:
        saved = ist.raw_lines - ist.after_collapse
        report_lines.append(
            f"| `{task.name}` | {ist.raw_lines} | {ist.before_collapse} | **{ist.after_collapse}** | -{saved} |"
        )

    report_path = DIST_DIR / "BUILD_REPORT.md"
    report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")
    print(f"构建完成！报告已输出至: {report_path}")


if __name__ == "__main__":
    main()
