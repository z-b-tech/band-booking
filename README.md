# 排练室预约 · 音乐社

一个给学校音乐社用的排练室登记网站：多支乐队在线登记时间段，设备外借走审批，
**联系方式只对管理员可见**，其他人只能看到「时间段 + 乐队名 + 负责人」。

- 纯静态页（HTML/CSS/JS，无需构建、无需 Node）
- 数据存 Supabase 免费版
- 手机优先，扫码就能用

> ## ✅ 已上线
>
> | 项目 | 值 |
> |---|---|
> | **访问地址** | **https://z-b-tech.github.io/band-booking/** |
> | 仓库 | https://github.com/z-b-tech/band-booking |
> | Supabase 项目 | `slvwroxkujqipojzltrq` |
> | 区域 | `ap-southeast-1`（新加坡） |
> | API 地址 | `https://slvwroxkujqipojzltrq.supabase.co` |
> | 数据库 | 表 / 视图 / 函数 / RLS 已建好，6 种默认设备已入库 |
> | 管理员账号 | `2312729929@qq.com`（密码见 `E:\Work\band-booking-secrets\admin-account.txt`） |
> | 公开注册 | 已关闭 |
>
> 已验证：公网首页 200、演示横幅消失、页脚显示「数据由 Supabase 提供」、
> 设备从云端读取、匿名读原表 401、无 JS 报错；国内直连可用（TTFB 约 0.6s，
> 数据约 1.5–2s 出现），**同学不需要梯子**。

---

## 先说清楚三件事

1. **只有一个排练室**：同一时间允许多支乐队登记（按你的要求），但会标红提醒「N 队时段重叠」。
2. **开放时间**：`10:00–14:00`、`17:30–21:00`，30 分钟一格。
3. **最多提前 10 天**（含今天，共 11 天可选）。

---

## 一、先看效果（演示模式，1 分钟）

直接双击 `index.html`，或者起个本地服务：

```bash
python -m http.server 8123
# 浏览器打开 http://127.0.0.1:8123
```

没填 Supabase 配置时自动进入**演示模式**：数据存在本机浏览器，管理员账号
`admin` / `admin123`。可以先点一遍确认交互是不是你要的。

> 演示模式的数据别人看不到，正式使用必须接 Supabase（下一步）。

---

## 二、接 Supabase（约 5 分钟）

### 1. 建项目

1. 打开 <https://supabase.com>，用 GitHub 或邮箱注册（免费）
2. **New project** → 填名字、数据库密码（记下来，之后用不到但别丢）→ 选个离得近的区域（新加坡 / 东京都行）
3. 等 1–2 分钟初始化

### 2. 建表

1. 左侧 **SQL Editor** → **New query**
2. 把 `supabase/schema.sql` 全文粘进去 → **Run**
3. 看到 `Success. No rows returned` 就对了（会顺带建好 6 种默认设备）

### 3. 拿密钥

左侧 **Project Settings → API**，复制两个值：

| 名称 | 长相 | 填到哪 |
|---|---|---|
| Project URL | `https://xxxx.supabase.co` | `config.js` 的 `SUPABASE_URL` |
| anon public key | `eyJhbGciOi...`（很长） | `config.js` 的 `SUPABASE_ANON_KEY` |

```js
// config.js
window.APP_CONFIG = {
  SUPABASE_URL: "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi...",
  CLUB_NAME: "音乐社",
  ROOM_NAME: "排练室",
};
```

> `anon key` 是**公开**的，写在前端没问题——真正的保护在数据库的 RLS 策略里
> （见下面「安全性」）。

### 4. 管理员账号（已经建好）

本项目已经创建好管理员账号：

```
邮箱：2312729929@qq.com
密码：见 E:\Work\band-booking-secrets\admin-account.txt
```

同时已通过管理接口关闭「允许新用户注册」，所以别人无法自助注册成管理员。

> 想改密码：Supabase 控制台 → Authentication → Users → 点该用户 → Reset password，
> 或者登录后在自己的账号页里改。
>
> ⚠️ 注意：`.local` / `band-booking-secrets` 里的密码文件**不要**上传到 GitHub，
> 它们是本地保存的凭据。

### 5. 刷新页面

顶部黄色「演示模式」横幅消失 → 点右上角「管理员登录」→ 用刚建的邮箱密码登录。

---

## 三、部署到公网（GitHub Pages，免费）

> 只需要传这些：`index.html`、`styles.css`、`app.js`、`config.js`、
> `vendor/`、`supabase/`、`README.md`。
> **不要传 `test/`**（测试脚本和截图，几十 MB 的图）。

1. GitHub 新建仓库，比如 `band-booking`
2. 把上面这些文件推上去（`vendor/` 也要，别漏）：

```bash
git init
git add .
git commit -m "排练室预约"
git remote add origin https://github.com/<你的用户名>/band-booking.git
git push -u origin main
```

3. 仓库 **Settings → Pages** → Source 选 `Deploy from a branch` → 分支 `main`、目录 `/ (root)` → Save
4. 等 1 分钟，访问 `https://<你的用户名>.github.io/band-booking/`

免费账号要求仓库 **Public**（代码公开，但数据在 Supabase，别人改不了）。

其他选择（操作类似，直接部署静态目录即可）：Cloudflare Pages、Vercel、Netlify。

---

## 四、日常怎么用

### 乐队负责人

1. 打开网址 → 选日期（今天到 10 天后）
2. 在时间轴上点一下开始时间，再点一下结束时间（可跨多格）
3. 填乐队名、负责人、联系方式（微信/QQ/手机）、是否要双踩、备注 → 提交
4. 提交成功后会记在「我的登记」里，**可以自己取消**（存在本机浏览器，换设备就看不到）

### 你（管理员）

- **管理** 页签：待审批外借（通过 / 拒绝）、全部预约（含联系方式，可删除）、设备增删
- 联系方式只在这个页面出现；公开的时间轴和当日列表里没有

### 设备外借

- 提交后是「待审批」，你通过之后才显示「已批准」
- 库存会自动扣减：同一设备在同一时段被借走后，库存页显示剩余数量
- 数据库层面会拦截超借（`create_borrow` 里做了库存校验）

---

## 五、安全性（重要）

| 项目 | 做法 |
|---|---|
| 联系方式 | 存在 `bookings.contact` / `borrows.contact`，**anon 角色没有该表的读权限**；对外只暴露 `bookings_public` / `borrows_public` 视图，视图里没有 contact 字段 |
| 写入 | 匿名用户不能直接 insert，只能调 `create_booking` / `create_borrow` 这两个 `security definer` 函数，函数内部校验时间、日期、库存 |
| 取消 | 必须同时提供 `id` + 随机 `cancel_token`，token 只存在提交者浏览器里 |
| 管理员 | Supabase Auth 登录后是 `authenticated` 角色，才有读原表、改状态的权限 |

**请注意**：`cancel_token` 存在浏览器 localStorage，同一个浏览器上任何人都能取消该浏览器的登记（社团场景够用，不算严格的身份认证）。

---

## 六、想改点东西

| 想改什么 | 改哪里 |
|---|---|
| 开放时间 / 时段长度 | `app.js` 顶部 `WINDOWS` + `SLOT`；**同时**改 `schema.sql` 里的 `booking_in_window` 约束（两处必须一致） |
| 最多提前几天 | `app.js` 的 `MAX_DAYS` + `schema.sql` 里 `v_today + 10` |
| 社团名字 | `config.js` 的 `CLUB_NAME` / `ROOM_NAME` |
| 默认设备清单 | `schema.sql` 第 7 段，或管理页面直接加 |
| 配色 | `styles.css` 顶部 `:root` 变量 |

---

## 七、常见问题

**Q：登录提示 "Invalid login credentials"**
没建用户，或密码错。去 Authentication → Users 确认用户存在且是 Confirmed。

**Q：提交报 "new row violates row-level security policy"**
`schema.sql` 没跑全，或函数权限没授予。重新完整跑一遍 schema。

**Q：别人打开显示「演示模式」**
`config.js` 没填对，或部署时漏了 `config.js`。检查浏览器控制台是否有 `supabase` 报错。

**Q：Supabase 免费版会不会停？**
项目连续 7 天没有请求会暂停，打开后台点一下 Restore 即可。社团每周都有人用的话不会触发。

**Q：能同时两支队用一个时段吗？**
可以（按你的要求），会标红「N 队时段重叠」。想改成排他也不难：在 `schema.sql`
的 `create_booking` 里加一段重叠校验即可。

---

## 八、目录结构

```
band-booking/
├─ index.html            页面
├─ styles.css            样式
├─ app.js                逻辑（前端 + 两种后端适配）
├─ config.js             ← 你唯一需要改的文件
├─ vendor/supabase.js    supabase-js（本地文件，不依赖 CDN）
├─ supabase/schema.sql   数据库结构（在 Supabase 里跑一次）
└─ test/                 开发用：CDP 端到端测试 + 截图
   ├─ e2e.mjs
   ├─ diag-overflow.mjs
   └─ shot-mobile.mjs
```

## 九、开发 / 自测

```bash
python -m http.server 8123            # 起服务
msedge --headless=new --remote-debugging-port=9222 about:blank   # 起无头浏览器
node test/e2e.mjs                     # 16 项交互测试
```

测试覆盖：日期范围、过去时段拦截、点选时段、跨窗口不串段、提交、双踩标记、
我的登记、取消、设备库存、管理员登录、联系方式仅管理员可见、无 JS 异常。
