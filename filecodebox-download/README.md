# FileCodeBox on Cloudflare Workers

一个可匿名分享文件/文本、支持提取码的 Cloudflare Workers 应用。

## 一键部署

1) 安装 Wrangler（如未安装）
```bash
npm i -g wrangler
```

2) 配置绑定（需先在 Cloudflare 创建 KV 与 R2）
- KV Namespace 绑定名：`FILECODEBOX_KV`
- R2 Bucket 绑定名：`FILECODEBOX_R2`

3) 配置 Secret（敏感项）
```bash
wrangler secret put PERMANENT_PASSWORD   # 留空则使用默认 123456
```

4) 首次部署（可带上默认变量，也可省略使用默认值）
```bash
wrangler deploy \
  --var MAX_FILE_SIZE=90 \
  --var MAX_TEXT_SIZE=1 \
  --var QR_API=https://api.qrserver.com/v1/create-qr-code/ \
  --var NOTICE_TTL_HOURS=24 \
  --var UPLOAD_FILE_RPM=10 \
  --var UPLOAD_TEXT_RPM=20 \
  --var VERIFY_PERM_RPM=20 \
  --var GET_INFO_RPM=120 \
  --var DOWNLOAD_RPM=60
```

说明：
- `MAX_FILE_SIZE`、`MAX_TEXT_SIZE` 支持「MB」或大于 100000 的字节数。
- `PERMANENT_PASSWORD` 未设置时，默认 `123456`。
- 可通过 `QR_API` 切换二维码服务。
- `NOTICE_TTL_HOURS` 控制首次声明弹窗 24h/自定义小时重复出现。
- 速率限制值均为每分钟上限，按需调整。

## 本地开发
```bash
wrangler dev
```

## 常用维护
- 更新某个变量：直接修改 `--var` 值后再 `wrangler deploy`。
- 更新 Secret：
```bash
wrangler secret delete PERMANENT_PASSWORD
wrangler secret put PERMANENT_PASSWORD
```

## 环境变量一览

## 使用 GitHub Actions 自动部署（推荐）

参考部署文档：[CloudPaste GitHub Actions 自动部署](https://doc.cloudpaste.qzz.io/guide/deploy-github-actions)

本项目已内置工作流 `.github/workflows/deploy.yml`，在你 Push 到 `main/master` 时自动部署到 Cloudflare Workers。

准备工作：
1) 在 Cloudflare Dashboard 提前创建并绑定资源（一次）：
   - KV Namespace 绑定名：`FILECODEBOX_KV`
   - R2 Bucket 绑定名：`FILECODEBOX_R2`
2) 在 GitHub 仓库设置 Secrets：
   - `CLOUDFLARE_API_TOKEN`（必须，含 Workers 权限）
   - `CLOUDFLARE_ACCOUNT_ID`（必须）
   - `PERMANENT_PASSWORD`（可选，作为 Secret 透传）
3) 在 GitHub 仓库 Settings → Variables 添加（可选）：
   - `MAX_FILE_SIZE`、`MAX_TEXT_SIZE`、`QR_API`、`NOTICE_TTL_HOURS`
   - `UPLOAD_FILE_RPM`、`UPLOAD_TEXT_RPM`、`VERIFY_PERM_RPM`、`GET_INFO_RPM`、`DOWNLOAD_RPM`

触发部署：
- 直接 Push 到 main/master；或在 Actions 中手动 Run Workflow。

注意：
- Bindings（`FILECODEBOX_KV` / `FILECODEBOX_R2`）建议在 Cloudflare Dashboard 配置一次后长期复用；工作流不会创建绑定。
- 变量也可全部在 Dashboard 配置；GitHub Actions 中设置的会在部署时注入优先级更高。
- Secrets：
  - `PERMANENT_PASSWORD`（可选，默认 123456）
- Vars：
  - `MAX_FILE_SIZE`、`MAX_TEXT_SIZE`
  - `QR_API`
  - `NOTICE_TTL_HOURS`
  - `UPLOAD_FILE_RPM`、`UPLOAD_TEXT_RPM`、`VERIFY_PERM_RPM`、`GET_INFO_RPM`、`DOWNLOAD_RPM`
