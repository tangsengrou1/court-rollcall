# 北大男篮二队 · 出勤网站

Cloudflare Workers + D1，React/Vite 前端。无需 OpenAI 账号。

## 权限

- 李飞跃、刘厚成：创建活动、点名、全队统计、发放/重置账号邀请。
- 王斯瑶：点名、结束已开始的活动、全队统计；不能创建活动或管理账号。教练不计入球员出勤率。
- 其余队员：只修改自己的报名、查看自己的出勤。可看队内活动及报名名单。

所有权限在服务器校验，不能通过修改前端身份绕过。

## 账号

邀请链接 7 天过期、单次使用。密码至少 12 个字符。管理员重新发放邀请并由成员完成激活后，旧密码和登录失效。密码使用带随机盐的 PBKDF2-SHA512（100,000 次）和单独的 HMAC pepper；会话令牌仅以哈希保存在数据库。生产 Cookie 为 Secure、HttpOnly、SameSite=Strict。AUTH_PEPPER 保存在 Cloudflare Secret，不能替换或丢失，否则已激活账号需要重置。

## 本地开发

Node 22.13+。运行 `npm ci`、`npm run build`。在 `.dev.vars` 中设置随机 `AUTH_PEPPER`。用 Wrangler 在本地应用 migrations，再启动 `npm run preview`。生产数据不在代码包中。名单初始化及首次邀请只执行一次，不要重新覆盖生产账号。

## 发布

`npm run check` → `npm run build` → `npm run deploy`。wrangler.jsonc 已指定资源。首次发布前使用官方 Wrangler 登录授权，应用 D1 迁移并设置 AUTH_PEPPER。后续发布先应用新增的 D1 迁移，再发布代码。默认使用 Workers Free，不自动升级套餐。

## 成员管理

李飞跃或刘厚成登录网站后，点击右上角「成员管理」。在「添加队员」填入完整姓名并保存；然后在该队员旁点击「生成邀请」，通过微信私聊发送链接。修改姓名时点击「改名」并保存，原账号和出勤记录继续关联。新队员的出勤率从加入后的活动开始计算。成员不能自行修改他人姓名或添加队员。

## 协作开发

源码逐文件保存在 GitHub；`court-rollcall-source.zip` 是早期备份，可忽略。请通过分支和 Pull Request 提交功能，合并前运行 `npm ci && npm run check && npm run build`。具体流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。仓库是私有的，维护者需要通过 GitHub 邀请协作者。生产数据库、密码和邀请链接不在仓库中，不能提交。

## 维护

定期通过 Cloudflare D1 导出备份。操作日志保存在 audit 表（不包含密码、邀请明文、会话令牌）。邀请码和测试凭据位于忽略的 work/，不得提交或发布。开发测试只在本地数据库运行。

暂未实现自动短信/微信提醒、成员移除或取消活动。日期统一为北京时间；已开始活动不可修改报名；完成所有球员点名后才能结束并计入统计。已结束活动可修正出勤并记录操作。
