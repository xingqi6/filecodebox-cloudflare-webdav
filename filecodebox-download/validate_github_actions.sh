#!/bin/bash

echo "🔍 验证 GitHub Actions 配置..."

# 检查工作流文件
echo "📁 检查工作流文件..."
if [ -f ".github/workflows/deploy.yml" ]; then
    echo "✅ .github/workflows/deploy.yml 存在"
else
    echo "❌ .github/workflows/deploy.yml 不存在"
    exit 1
fi

# 检查工作流语法
echo ""
echo "📝 检查工作流语法..."
if command -v yamllint &> /dev/null; then
    if yamllint .github/workflows/deploy.yml; then
        echo "✅ YAML 语法正确"
    else
        echo "❌ YAML 语法错误"
        exit 1
    fi
else
    echo "ℹ️ yamllint 未安装，跳过语法检查"
fi

# 检查必要的配置
echo ""
echo "⚙️ 检查工作流配置..."

# 检查触发条件
if grep -q "on:" .github/workflows/deploy.yml && grep -q "push:" .github/workflows/deploy.yml; then
    echo "✅ 推送触发器配置正确"
else
    echo "❌ 推送触发器配置缺失"
fi

if grep -q "workflow_dispatch:" .github/workflows/deploy.yml; then
    echo "✅ 手动触发器配置正确"
else
    echo "❌ 手动触发器配置缺失"
fi

# 检查环境变量
if grep -q "R2_BUCKET_NAME:" .github/workflows/deploy.yml; then
    echo "✅ R2 存储桶名称配置正确"
else
    echo "❌ R2 存储桶名称配置缺失"
fi

if grep -q "KV_NAMESPACE_NAME:" .github/workflows/deploy.yml; then
    echo "✅ KV 命名空间名称配置正确"
else
    echo "❌ KV 命名空间名称配置缺失"
fi

# 检查密钥引用
if grep -q "CLOUDFLARE_API_TOKEN" .github/workflows/deploy.yml; then
    echo "✅ Cloudflare API Token 引用正确"
else
    echo "❌ Cloudflare API Token 引用缺失"
fi

if grep -q "CLOUDFLARE_ACCOUNT_ID" .github/workflows/deploy.yml; then
    echo "✅ Cloudflare Account ID 引用正确"
else
    echo "❌ Cloudflare Account ID 引用缺失"
fi

# 检查作业步骤
echo ""
echo "🔧 检查作业步骤..."

required_steps=(
    "Checkout code"
    "Setup Node.js"
    "Install dependencies"
    "Create R2 Buckets"
    "Create KV Namespaces"
    "Update wrangler.toml"
    "Deploy to Cloudflare Workers"
)

for step in "${required_steps[@]}"; do
    if grep -q "$step" .github/workflows/deploy.yml; then
        echo "✅ 步骤 '$step' 存在"
    else
        echo "❌ 步骤 '$step' 缺失"
    fi
done

# 检查项目文件
echo ""
echo "📋 检查项目文件..."
required_files=("src/index.js" "package.json" "wrangler.toml")
for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file 存在"
    else
        echo "❌ $file 缺失"
    fi
done

# 检查 wrangler.toml 配置
echo ""
echo "🔧 检查 wrangler.toml 配置..."
if grep -q "FILECODEBOX_KV" wrangler.toml; then
    echo "✅ KV 绑定配置正确"
else
    echo "❌ KV 绑定配置缺失"
fi

if grep -q "FILECODEBOX_R2" wrangler.toml; then
    echo "✅ R2 绑定配置正确"
else
    echo "❌ R2 绑定配置缺失"
fi

if grep -q "filecodebox-r2-f6bd1dfe" wrangler.toml; then
    echo "✅ R2 存储桶名称配置正确"
else
    echo "❌ R2 存储桶名称配置缺失"
fi

# 生成配置摘要
echo ""
echo "📊 配置摘要:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 从工作流文件中提取资源名称
r2_bucket=$(grep "R2_BUCKET_NAME:" .github/workflows/deploy.yml | cut -d'"' -f2)
r2_preview_bucket=$(grep "R2_PREVIEW_BUCKET_NAME:" .github/workflows/deploy.yml | cut -d'"' -f2)
kv_namespace=$(grep "KV_NAMESPACE_NAME:" .github/workflows/deploy.yml | cut -d'"' -f2)

echo "🪣 R2 存储桶: $r2_bucket"
echo "🪣 R2 预览存储桶: $r2_preview_bucket"
echo "🗄️ KV 命名空间: $kv_namespace"

echo ""
echo "📝 下一步操作:"
echo "1. 在 GitHub 仓库设置中添加以下 Secrets:"
echo "   - CLOUDFLARE_API_TOKEN"
echo "   - CLOUDFLARE_ACCOUNT_ID"
echo "   - PERMANENT_PASSWORD (可选)"
echo ""
echo "2. 可选：添加以下 Variables 来自定义配置:"
echo "   - MAX_FILE_SIZE, MAX_TEXT_SIZE"
echo "   - QR_API, NOTICE_TTL_HOURS"
echo "   - UPLOAD_FILE_RPM, UPLOAD_TEXT_RPM, 等"
echo ""
echo "3. 推送代码到 main/master 分支触发自动部署"
echo ""
echo "📖 详细说明请查看 GITHUB_ACTIONS_SETUP.md"

echo ""
echo "✅ GitHub Actions 配置验证完成！"