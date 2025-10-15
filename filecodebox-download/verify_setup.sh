#!/bin/bash

echo "🔍 验证 FileCodeBox 设置..."

# 检查必要文件
echo "📁 检查项目文件..."
files=("wrangler.toml" "src/index.js" "package.json")
for file in "${files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file 存在"
    else
        echo "❌ $file 不存在"
        exit 1
    fi
done

# 检查 wrangler.toml 配置
echo ""
echo "⚙️ 检查 wrangler.toml 配置..."

# 检查 R2 配置
r2_bucket=$(grep "bucket_name" wrangler.toml | cut -d'"' -f2)
if [ -n "$r2_bucket" ]; then
    echo "✅ R2 存储桶名称: $r2_bucket"
else
    echo "❌ R2 存储桶配置缺失"
fi

# 检查 KV 配置
kv_id=$(grep "id =" wrangler.toml | head -1 | cut -d'"' -f2)
if [ "$kv_id" = "PLACEHOLDER_KV_ID" ]; then
    echo "⚠️ KV 命名空间 ID 仍为占位符，需要运行资源创建脚本"
elif [ -n "$kv_id" ]; then
    echo "✅ KV 命名空间 ID: $kv_id"
else
    echo "❌ KV 命名空间配置缺失"
fi

# 检查环境变量
echo ""
echo "🌍 检查环境变量..."
if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
    echo "✅ CLOUDFLARE_API_TOKEN 已设置"
else
    echo "⚠️ CLOUDFLARE_API_TOKEN 未设置"
fi

if [ -n "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo "✅ CLOUDFLARE_ACCOUNT_ID 已设置"
else
    echo "⚠️ CLOUDFLARE_ACCOUNT_ID 未设置"
fi

# 检查 wrangler 安装
echo ""
echo "🛠️ 检查工具..."
if command -v wrangler &> /dev/null; then
    wrangler_version=$(wrangler --version)
    echo "✅ Wrangler 已安装: $wrangler_version"
    
    # 检查登录状态
    if wrangler whoami &> /dev/null; then
        echo "✅ Wrangler 已登录"
    else
        echo "⚠️ Wrangler 未登录，需要设置 API Token 或运行 wrangler login"
    fi
else
    echo "❌ Wrangler 未安装"
fi

echo ""
echo "📋 下一步操作："
if [ "$kv_id" = "PLACEHOLDER_KV_ID" ]; then
    echo "1. 设置 Cloudflare API Token 和 Account ID"
    echo "2. 运行 ./create_cloudflare_resources.sh 创建资源"
    echo "3. 运行 wrangler deploy 部署应用"
else
    echo "1. 确保 Cloudflare 凭据已设置"
    echo "2. 运行 wrangler deploy 部署应用"
fi

echo ""
echo "📖 详细说明请查看 SETUP_INSTRUCTIONS.md"