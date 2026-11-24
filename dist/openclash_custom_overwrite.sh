#!/bin/sh
. /usr/share/openclash/ruby.sh
. /usr/share/openclash/log.sh
. /lib/functions.sh

# ==============================================================================
# OpenClash 自定义覆写脚本 (由 https://github.com/null0so/clash-rules 自动生成)
# 用法：打开 OpenWrt -> 服务 -> OpenClash -> 覆写设置 -> 开发者选项
#       将本脚本内容粘贴到 `exit 0` 之前（或直接替换整个编辑器内容），点击保存并应用配置！
# ==============================================================================

CONFIG_FILE="$1"
if [ -z "$CONFIG_FILE" ] || [ ! -f "$CONFIG_FILE" ]; then
    exit 0
fi

LOG_OUT "Tip: [clash-rules] Applying AI & High-Traffic MRS routing rules from null0so/clash-rules..."

ruby -ryaml - "$CONFIG_FILE" << 'RUBY_EOF'
# encoding: UTF-8
begin
  filename = ARGV[0]
  raw = File.read(filename, encoding: 'UTF-8')
  config = YAML.respond_to?(:unsafe_load) ? YAML.unsafe_load(raw) : YAML.load(raw)
  raise 'Empty YAML config' unless config.is_a?(Hash)

  base_url = 'https://testingcf.jsdelivr.net/gh/null0so/clash-rules@main/dist/ruleset'
  no_info  = '(?i)剩余|到期|官网|套餐|重置|群组|频道'
  ai_safe  = '(?i)港|HK|Hong\s?Kong|澳门|MO|Macao|俄|RU|Russia|中国|CN|剩余|到期|官网|套餐|重置|群组|频道'
  ht_ex    = '(?i)高倍率|[2-9](\.\d+)?[xX倍]|家宽|住宅|原生|剩余|到期|官网|套餐|重置|群组|频道'

  # 1. 性能优化与嗅探（保留 OpenClash 原有端口、TUN 与透明代理配置）
  config['unified-delay'] = true
  config['tcp-concurrent'] = true
  config['sniffer'] = {
    'enable' => true,
    'force-dns-mapping' => true,
    'parse-pure-ip' => true,
    'override-destination' => false,
    'sniff' => {
      'HTTP' => { 'ports' => [80, '8080-8880'], 'override-destination' => true },
      'TLS'  => { 'ports' => [443, 8443] },
      'QUIC' => { 'ports' => [443, 8443] }
    },
    'skip-domain' => ['Mijia Cloud', '+.push.apple.com', 'localhost', '+.local']
  }

  # 2. DNS 防泄露加固（不覆盖 OpenClash 的 listen 7874 端口，仅开启 respect-rules 并修正污染）
  config['dns'] ||= {}
  config['dns']['enable'] = true
  config['dns']['respect-rules'] = true
  config['dns']['proxy-server-nameserver'] ||= [
    'https://223.5.5.5/dns-query',
    'https://120.53.53.53/dns-query'
  ]
  config['dns']['nameserver-policy'] ||= {}
  config['dns']['nameserver-policy']['rule-set:private_domain,cn_domain'] = [
    'https://223.5.5.5/dns-query',
    'https://120.53.53.53/dns-query'
  ]
  # 若用户未在 OpenClash 自定义国外 DoH，补充防污染 DoH（因开启了 respect-rules，会自动走对应代理节点）
  if !config['dns']['nameserver'].is_a?(Array) || config['dns']['nameserver'].empty?
    config['dns']['nameserver'] = [
      'https://dns.google/dns-query',
      'https://cloudflare-dns.com/dns-query'
    ]
  end
  # 清理 fake-ip-filter 中可能误伤 Google 鉴权的通用域名（保留 stun）
  if config['dns']['fake-ip-filter'].is_a?(Array)
    config['dns']['fake-ip-filter'].reject! do |item|
      s = item.to_s.downcase
      (s.include?('google') || s.include?('gstatic')) && !s.include?('stun')
    end
  end

  # 3. 策略组定义（采用纯中文+英文命名，100% 规避 OpenWrt LuCI/Shell 4字节 Emoji 乱码问题）
  config['proxy-groups'] = [
    {
      'name' => '大流量节点',
      'type' => 'select',
      'proxies' => ['大流量自动优选'],
      'include-all' => true,
      'exclude-filter' => no_info
    },
    {
      'name' => '下载专用',
      'type' => 'select',
      'proxies' => ['大流量节点', '大流量自动优选', '全球直连'],
      'include-all' => true,
      'exclude-filter' => no_info
    },
    {
      'name' => 'Google-Antigravity',
      'type' => 'select',
      'include-all' => true,
      'exclude-filter' => ai_safe,
      'proxies' => ['大流量节点']
    },
    {
      'name' => 'Google-AI',
      'type' => 'select',
      'proxies' => ['Google-Antigravity'],
      'include-all' => true,
      'exclude-filter' => ai_safe
    },
    {
      'name' => 'Google-服务',
      'type' => 'select',
      'proxies' => ['Google-AI', 'Google-Antigravity', '大流量节点'],
      'include-all' => true,
      'exclude-filter' => no_info
    },
    {
      'name' => 'AI-Claude',
      'type' => 'select',
      'include-all' => true,
      'exclude-filter' => ai_safe,
      'proxies' => ['Google-Antigravity', '大流量节点']
    },
    {
      'name' => 'AI-OpenAI',
      'type' => 'select',
      'include-all' => true,
      'exclude-filter' => ai_safe,
      'proxies' => ['Google-Antigravity', '大流量节点']
    },
    {
      'name' => 'AI-编程',
      'type' => 'select',
      'proxies' => ['Google-Antigravity', 'AI-Claude', 'AI-OpenAI', '大流量节点'],
      'include-all' => true,
      'exclude-filter' => ai_safe
    },
    {
      'name' => 'AI-其他',
      'type' => 'select',
      'proxies' => ['Google-AI', 'AI-OpenAI', 'AI-Claude', '大流量节点'],
      'include-all' => true,
      'exclude-filter' => ai_safe
    },
    {
      'name' => '大流量自动优选',
      'type' => 'url-test',
      'url' => 'https://www.gstatic.com/generate_204',
      'interval' => 300,
      'tolerance' => 50,
      'lazy' => true,
      'include-all' => true,
      'exclude-filter' => ht_ex
    },
    {
      'name' => '全球直连',
      'type' => 'select',
      'proxies' => ['DIRECT', '大流量节点']
    }
  ]

  # 4. 注册你个人仓库每日自动去重编译的 .mrs 规则集（存入 OpenClash 标准 ./rule_provider/ 目录）
  dom_provider = lambda do |name|
    {
      'type' => 'http',
      'behavior' => 'domain',
      'format' => 'mrs',
      'url' => "#{base_url}/#{name}.mrs",
      'path' => "./rule_provider/#{name}.mrs",
      'interval' => 86400
    }
  end

  ip_provider = lambda do |name|
    {
      'type' => 'http',
      'behavior' => 'ipcidr',
      'format' => 'mrs',
      'url' => "#{base_url}/#{name}.mrs",
      'path' => "./rule_provider/#{name}.mrs",
      'interval' => 86400
    }
  end

  config['rule-providers'] = {
    'private_domain'     => dom_provider.call('private_domain'),
    'private_ip'         => ip_provider.call('private_ip'),
    'google_antigravity' => dom_provider.call('google_antigravity'),
    'google_ai'          => dom_provider.call('google_ai'),
    'google_auth'        => dom_provider.call('google_auth'),
    'downloads'          => dom_provider.call('downloads'),
    'steam_cn'           => dom_provider.call('steam_cn'),
    'steam'              => dom_provider.call('steam'),
    'claude'             => dom_provider.call('claude'),
    'openai'             => dom_provider.call('openai'),
    'ai_coding'          => dom_provider.call('ai_coding'),
    'ai_others'          => dom_provider.call('ai_others'),
    'google_service'     => dom_provider.call('google_service'),
    'google_ip'          => ip_provider.call('google_ip'),
    'apple_cn'           => dom_provider.call('apple_cn'),
    'microsoft_cn'       => dom_provider.call('microsoft_cn'),
    'cn_domain'          => dom_provider.call('cn_domain'),
    'github'             => dom_provider.call('github'),
    'telegram_domain'    => dom_provider.call('telegram_domain'),
    'telegram_ip'        => ip_provider.call('telegram_ip'),
    'geolocation_not_cn' => dom_provider.call('geolocation_not_cn'),
    'cn_ip'              => ip_provider.call('cn_ip')
  }

  # 5. 严格自上而下分流顺序
  config['rules'] = [
    'DOMAIN,localhost,DIRECT',
    'DOMAIN-SUFFIX,local,DIRECT',
    'IP-CIDR,127.0.0.0/8,DIRECT,no-resolve',
    'IP-CIDR6,::1/128,DIRECT,no-resolve',
    'RULE-SET,private_domain,DIRECT',
    'RULE-SET,private_ip,DIRECT,no-resolve',

    'DOMAIN-KEYWORD,cloudcode-pa,Google-Antigravity',
    'RULE-SET,google_antigravity,Google-Antigravity',

    'DOMAIN-KEYWORD,aiplatform.googleapis.com,Google-AI',
    'RULE-SET,google_ai,Google-AI',

    'RULE-SET,google_auth,Google-服务',

    'RULE-SET,downloads,下载专用',
    'RULE-SET,steam_cn,全球直连',
    'RULE-SET,steam,下载专用',

    'RULE-SET,claude,AI-Claude',
    'RULE-SET,openai,AI-OpenAI',
    'RULE-SET,ai_coding,AI-编程',
    'RULE-SET,ai_others,AI-其他',

    'RULE-SET,google_service,Google-服务',
    'RULE-SET,google_ip,Google-服务,no-resolve',

    'RULE-SET,apple_cn,全球直连',
    'RULE-SET,microsoft_cn,全球直连',
    'RULE-SET,cn_domain,全球直连',

    'RULE-SET,github,大流量节点',
    'RULE-SET,telegram_domain,大流量节点',
    'RULE-SET,telegram_ip,大流量节点,no-resolve',
    'RULE-SET,geolocation_not_cn,大流量节点',
    'RULE-SET,cn_ip,全球直连,no-resolve',
    'MATCH,大流量节点'
  ]

  File.open(filename, 'w:UTF-8') do |f|
    f.write(config.to_yaml)
  end
rescue => e
  STDERR.puts "[clash-rules] Ruby overwrite error: #{e.class}: #{e.message}"
end
RUBY_EOF

LOG_OUT "Tip: [clash-rules] Custom AI & High-Traffic rules applied successfully."
exit 0
