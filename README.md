# Movie Nav

Astro SSR + Cloudflare Workers 影视导航站。

## 功能

- 首页展示百度电影榜、电视剧榜。
- 榜单每天通过 Cloudflare Cron 自动刷新到 KV。
- 点击影片进入详情页并选择集数播放。
- 支持从 MacCMS XML API 搜索全站资源。
- 播放地址优先支持 m3u8/mp4。

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 部署

```bash
npm run deploy
```

生产配置在 `wrangler.jsonc`：

- Worker 名称：`movie-nav`
- 绑定域名：`movie.wp-bocai.xyz`
- KV：`TOP_CACHE`、`SESSION`
- 定时任务：每天 UTC 02:00 刷新榜单

GitHub Actions 自动部署需要在仓库 Secrets 中配置：

- `CLOUDFLARE_EMAIL`
- `CLOUDFLARE_API_KEY`
