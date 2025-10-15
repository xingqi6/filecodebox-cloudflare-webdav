#!/bin/bash

# Cloudflare 资源创建脚本
# 使用前请确保已设置 CLOUDFLARE_API_TOKEN 环境变量

echo "🚀 开始创建 Cloudflare 资源..."

# 生成的资源名称
R2_BUCKET_NAME="filecodebox-r2-f6bd1dfe"
R2_PREVIEW_BUCKET_NAME="filecodebox-r2-f6bd1dfe-preview"
KV_NAMESPACE_NAME="filecodebox-kv-2c88c777"

echo "📦 创建 R2 存储桶..."
echo "主存储桶: $R2_BUCKET_NAME"
wrangler r2 bucket create "$R2_BUCKET_NAME"
if [ $? -eq 0 ]; then
    echo "✅ 主存储桶创建成功"
else
    echo "❌ 主存储桶创建失败"
    exit 1
fi

echo "预览存储桶: $R2_PREVIEW_BUCKET_NAME"
wrangler r2 bucket create "$R2_PREVIEW_BUCKET_NAME"
if [ $? -eq 0 ]; then
    echo "✅ 预览存储桶创建成功"
else
    echo "❌ 预览存储桶创建失败"
    exit 1
fi

echo "🗄️ 创建 KV 命名空间..."
echo "KV 命名空间: $KV_NAMESPACE_NAME"
KV_OUTPUT=$(wrangler kv:namespace create "$KV_NAMESPACE_NAME")
if [ $? -eq 0 ]; then
    echo "✅ KV 命名空间创建成功"
    echo "$KV_OUTPUT"
    
    # 提取 KV ID
    KV_ID=$(echo "$KV_OUTPUT" | grep -o 'id = "[^"]*"' | sed 's/id = "\(.*\)"/\1/')
    echo "KV ID: $KV_ID"
    
    # 创建预览 KV 命名空间
    echo "创建预览 KV 命名空间..."
    KV_PREVIEW_OUTPUT=$(wrangler kv:namespace create "$KV_NAMESPACE_NAME" --preview)
    if [ $? -eq 0 ]; then
        echo "✅ 预览 KV 命名空间创建成功"
        echo "$KV_PREVIEW_OUTPUT"
        
        # 提取预览 KV ID
        KV_PREVIEW_ID=$(echo "$KV_PREVIEW_OUTPUT" | grep -o 'preview_id = "[^"]*"' | sed 's/preview_id = "\(.*\)"/\1/')
        echo "KV 预览 ID: $KV_PREVIEW_ID"
        
        # 更新 wrangler.toml
        echo "📝 更新 wrangler.toml 配置..."
        sed -i "s/PLACEHOLDER_KV_ID/$KV_ID/g" wrangler.toml
        sed -i "s/PLACEHOLDER_KV_PREVIEW_ID/$KV_PREVIEW_ID/g" wrangler.toml
        
        echo "✅ wrangler.toml 已更新"
    else
        echo "❌ 预览 KV 命名空间创建失败"
        exit 1
    fi
else
    echo "❌ KV 命名空间创建失败"
    exit 1
fi

echo "🎉 所有资源创建完成！"
echo ""
echo "📋 创建的资源："
echo "- R2 存储桶: $R2_BUCKET_NAME"
echo "- R2 预览存储桶: $R2_PREVIEW_BUCKET_NAME"
echo "- KV 命名空间: $KV_NAMESPACE_NAME (ID: $KV_ID)"
echo "- KV 预览命名空间: $KV_NAMESPACE_NAME (预览 ID: $KV_PREVIEW_ID)"
echo ""
echo "🚀 现在可以运行以下命令进行部署："
echo "wrangler deploy"