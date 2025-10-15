# FileCodeBox：GitHub Actions 自动部署到 Cloudflare（含上传到 GitHub 教程）

本文教你把本地项目推到 GitHub，并用 GitHub Actions + 环境变量自动部署到 Cloudflare Workers。参考实践：CloudPaste 的自动部署方案（思路类似）。

---

## 一、把本地项目上传到 GitHub

1. 创建仓库
   - 打开 GitHub → New repository → Repository name（如：filecodebox-cloudflare）→ Create repository。
2. 在本地初始化并推送
```bash
# 在项目根目录（包含 package.json / wrangler.toml）执行
git init
git add .
git commit -m "init"
# 将下行替换为你仓库的地址
git remote add origin https://github.com/<your-username>/filecodebox-cloudflare.git
git branch -M main
git push -u origin main
```
> 如果你以前已是 Git 仓库：只需要执行 add remote + push 两步。

---

## 二、Cloudflare 侧一次性准备

1) 创建并绑定资源（只做一次，后续复用）
- KV Namespace：绑定名 `FILECODEBOX_KV`
- R2 Bucket：绑定名 `FILECODEBOX_R2`
- 你可以用 Dashboard 完成绑定，也可以保持 wrangler.toml 的绑定占位符并由工作流注入（本文采用“工作流注入占位符”的方式）。

2) 获取账号信息
- Account ID：在 Dashboard 主页右侧可见
- API Token：My Profile → API Tokens → Create Token（包含 Workers 权限）

---

## 三、在 GitHub 配置 Secrets / Variables

进入仓库 Settings → Secrets and variables → Actions：

- Secrets（加密）
  - `CLOUDFLARE_API_TOKEN`：Cloudflare API Token（必须）
  - `CLOUDFLARE_ACCOUNT_ID`：你的 Account ID（必须）
  - `PERMANENT_PASSWORD`：可选（默认 123456）
  - `CF_KV_ID`：你的 KV Namespace id（必须）
  - `CF_KV_PREVIEW_ID`：可选，预览用 KV id（不填则用 `CF_KV_ID`）

- Variables（普通变量）
  - `CF_R2_BUCKET`：R2 bucket 名称（必须）
  - `CF_R2_PREVIEW_BUCKET`：可选，预览 bucket 名称（不填则用 `CF_R2_BUCKET`）
  - 业务可调变量（可选）：
    - `MAX_FILE_SIZE`, `MAX_TEXT_SIZE`, `QR_API`, `NOTICE_TTL_HOURS`
    - `UPLOAD_FILE_RPM`, `UPLOAD_TEXT_RPM`, `VERIFY_PERM_RPM`, `GET_INFO_RPM`, `DOWNLOAD_RPM`

> 说明：KV/R2 绑定不能直接通过 --var 注入，本文的工作流会在部署前用 sed 替换 wrangler.toml 里的占位符，从而实现“用环境变量自动填入绑定”。

---

## 四、仓库内已提供的自动化

- `.github/workflows/deploy.yml`：
  - 触发：push 到 `main`/`master` 或手动 `Run workflow`
  - 步骤：Checkout → Node → 安装依赖 → 安装 wrangler → 用 Secrets/Variables 替换 wrangler.toml 占位符 → `wrangler deploy`
- `wrangler.toml`：
  - `[[kv_namespaces]]` 与 `[[r2_buckets]]` 均为占位符，CI 部署时由 GitHub 环境变量自动替换：
    - `"__REPLACE_WITH_YOUR_KV_ID__"` ← `CF_KV_ID`
    - `"__REPLACE_WITH_YOUR_KV_PREVIEW_ID__"` ← `CF_KV_PREVIEW_ID`（或回退到 `CF_KV_ID`）
    - `"__REPLACE_WITH_YOUR_R2_BUCKET__"` ← `CF_R2_BUCKET`
    - `"__REPLACE_WITH_YOUR_R2_PREVIEW_BUCKET__"` ← `CF_R2_PREVIEW_BUCKET`（或回退到 `CF_R2_BUCKET`）

---

## 五、首次自动部署

1) 完成第三节的 Secrets/Variables 配置
2) 推送任意提交到 main 分支（或打开 Actions 手动执行 Deploy 工作流）
3) 工作流成功后，控制台会显示你的 Worker 访问地址（`*.workers.dev`）

---

## 六、变量管理与优先级

- 绑定（FILECODEBOX_KV、FILECODEBOX_R2）
  - 通过本教程方案由 GitHub 环境变量注入到 wrangler.toml
  - 如改用 Dashboard 绑定，可删除 wrangler.toml 的 [[kv_namespaces]] 和 [[r2_buckets]] 段
- 非敏感 Vars（大小、限流、QR_API 等）
  - 推荐在 Cloudflare Dashboard 的 Variables 里集中管理；也可在 GitHub Variables 设置，部署时注入
- Secret（PERMANENT_PASSWORD）
  - 可在 GitHub Secrets 或 Cloudflare Secrets 配置（任意一处即可），默认 123456

---

## 七、常见问题

- 工作流报错：
  - 检查 `CLOUDFLARE_API_TOKEN` 权限和 `CLOUDFLARE_ACCOUNT_ID` 正确性
  - 确认已在仓库设置里填了 `CF_KV_ID`、`CF_R2_BUCKET`（及预览可选项）
- 绑定冲突：
  - 若使用 Dashboard 绑定，就删除 wrangler.toml 中对应绑定；避免两边同时绑定造成冲突
- 国内访问：
  - 建议在 Workers → Settings → Triggers 添加自定义域名

---

## 八、快速校验

```bash
# 本地验证（可选）
wrangler dev
# 生产部署（由 Actions 执行，也可本地执行）
wrangler deploy
```

部署后访问：
- `https://<your-worker>.<account>.workers.dev`
- 或你的自定义域名

祝使用顺利！
