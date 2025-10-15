# Cloudflare 资源设置说明

## 🎯 概述

我已经为你的 FileCodeBox 项目生成了随机的资源名称并更新了配置。由于需要 Cloudflare API Token 才能创建资源，你需要手动完成以下步骤。

## 📋 生成的资源名称

- **R2 存储桶**: `filecodebox-r2-f6bd1dfe`
- **R2 预览存储桶**: `filecodebox-r2-f6bd1dfe-preview`
- **KV 命名空间**: `filecodebox-kv-2c88c777`

## 🔧 设置步骤

### 1. 获取 Cloudflare API Token

1. 访问 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 "Create Token"
3. 选择 "Custom token" 模板
4. 设置权限：
   - **Account** - `Cloudflare Workers:Edit`
   - **Zone Resources** - `Include All zones` (如果需要自定义域名)
   - **Account Resources** - `Include All accounts`
5. 复制生成的 Token

### 2. 设置环境变量

```bash
export CLOUDFLARE_API_TOKEN="your_api_token_here"
export CLOUDFLARE_ACCOUNT_ID="your_account_id_here"
```

你可以在 Cloudflare Dashboard 右侧边栏找到你的 Account ID。

### 3. 运行资源创建脚本

```bash
./create_cloudflare_resources.sh
```

这个脚本将会：
- 创建 R2 存储桶（主存储桶和预览存储桶）
- 创建 KV 命名空间（主命名空间和预览命名空间）
- 自动更新 `wrangler.toml` 配置文件中的 ID

### 4. 部署应用

资源创建完成后，运行：

```bash
wrangler deploy
```

## 🛠️ 手动创建资源（备选方案）

如果脚本执行失败，你也可以手动创建资源：

### 创建 R2 存储桶

```bash
wrangler r2 bucket create filecodebox-r2-f6bd1dfe
wrangler r2 bucket create filecodebox-r2-f6bd1dfe-preview
```

### 创建 KV 命名空间

```bash
wrangler kv:namespace create "filecodebox-kv-2c88c777"
wrangler kv:namespace create "filecodebox-kv-2c88c777" --preview
```

然后手动更新 `wrangler.toml` 文件中的 `PLACEHOLDER_KV_ID` 和 `PLACEHOLDER_KV_PREVIEW_ID`。

## 📝 配置文件说明

`wrangler.toml` 已经更新为使用新的资源名称：

```toml
[[kv_namespaces]]
binding = "FILECODEBOX_KV"
id = "PLACEHOLDER_KV_ID"  # 需要替换为实际的 KV ID
preview_id = "PLACEHOLDER_KV_PREVIEW_ID"  # 需要替换为实际的预览 KV ID

[[r2_buckets]]
binding = "FILECODEBOX_R2"
bucket_name = "filecodebox-r2-f6bd1dfe"
preview_bucket_name = "filecodebox-r2-f6bd1dfe-preview"
```

## 🚀 验证部署

部署成功后，你可以：

1. 访问你的 Workers 域名测试应用
2. 检查 R2 存储桶是否正常工作
3. 测试文件上传和下载功能

## 🔍 故障排除

如果遇到问题：

1. 确认 API Token 权限正确
2. 检查 Account ID 是否正确
3. 确认资源名称在你的账户中是唯一的
4. 查看 wrangler 日志获取详细错误信息

## 📞 需要帮助？

如果你在设置过程中遇到任何问题，请提供错误信息，我可以帮你解决。