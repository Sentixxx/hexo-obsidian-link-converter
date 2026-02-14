# hexo-obsidian-link-converter

把 Obsidian 双向链接（`[[...]]`）转换为 Hexo 永久链接（基于文章 front matter 的 `abbrlink`）。

## 功能

- 支持通过 `enable` 开关启用/禁用插件（兼容 `enbale` 拼写）
- 转换 `[[标题]]` -> `[标题](/posts/<abbrlink>)`
- 支持 `[[标题|别名]]`
- 支持 `[[标题#锚点]]` 与 `[[标题#锚点|别名]]`
- 可配置域名前缀，输出绝对地址
- 在 `before_post_render` 阶段转换，且仅修改编译内容，不修改源 Markdown 文件
- 不替换 fenced code block 与 inline code 中的 `[[...]]`
- 内置自动化测试（`npm test`）

## 安装

在 Hexo 根目录安装（本地开发可用 `npm link` 或 `file:` 方式）。

```bash
npm install hexo-obsidian-link-converter
```

## 配置

在 Hexo `_config.yml` 中添加：

```yml
obsidian_link_converter:
  # 可选，是否启用插件（默认 true）
  # 兼容旧拼写 enbale
  enable: true
  # 可选，配置后输出绝对链接
  # 例如: https://example.com/blog
  domain_prefix: ""
  # 可选，开启后打印调试日志
  debug: false
```

## 匹配规则

- 目标文章匹配优先级：`title` -> `slug`
- 只有目标文章存在 `abbrlink` 才会转换
- 找不到目标时保留原始 `[[...]]`

## 输出示例

假设文章 `Hello Hexo` 的 `abbrlink: abcd1234`

- `[[Hello Hexo]]` -> `[Hello Hexo](/posts/abcd1234)`
- `[[Hello Hexo|点我]]` -> `[点我](/posts/abcd1234)`
- `[[Hello Hexo#Section A]]` -> `[Hello Hexo](/posts/abcd1234#Section%20A)`

如果 `domain_prefix: https://example.com`

- `[[Hello Hexo]]` -> `[Hello Hexo](https://example.com/posts/abcd1234)`
