# 参与开发

本仓库是北大男篮二队出勤网站的源码。生产环境运行在 Cloudflare Workers + D1。请勿把生产账号、密码、邀请链接、`.dev.vars` 或数据库导出提交到 GitHub。

## 开始

1. 接受仓库所有者发来的 GitHub 私有仓库邀请，克隆仓库。
2. 安装 Node.js 22.13 或更新版本，运行 `npm ci`。
3. 从 `main` 新建功能分支，例如 `git switch -c feature/attendance-export`。
4. 本地设置 `.dev.vars` 中的 `AUTH_PEPPER`，使用本地 D1；不要使用生产密钥或生产数据库进行测试。
5. 修改后运行 `npm run check` 和 `npm run build`，提交并推送分支，在 GitHub 发起 Pull Request。

Pull Request 请写清功能变化、测试方法，以及是否包含 D1 数据库迁移。不要直接修改生产名单或出勤记录。合并后，由拥有 Cloudflare 发布权限的管理员先执行新迁移，再发布网站。

## 数据和权限

成员身份由 D1 的 `members` 表决定；活动报名和点名数据保存在 `team_state`。修改姓名必须保留原 `id`，否则历史出勤关联会丢失。新增数据库字段请创建新的 `migrations/` SQL 文件，不要改已在生产应用的迁移。管理员、教练和队员的权限必须在 `server/index.ts` 校验，前端隐藏按钮不能代替服务端检查。
