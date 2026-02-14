# hexo-obsidian-link-converter

<p align="center">
  <a href="https://www.npmjs.com/package/hexo-obsidian-link-converter">
    <img src="https://img.shields.io/npm/v/hexo-obsidian-link-converter.svg" alt="npm version">
  </a>
  <img src="https://img.shields.io/npm/dm/hexo-obsidian-link-converter.svg" alt="downloads">
  <img src="https://img.shields.io/npm/l/hexo-obsidian-link-converter.svg" alt="license">
  <img src="https://img.shields.io/node/v/hexo-obsidian-link-converter.svg" alt="node version">
</p>

Convert Obsidian-style bidirectional links (`[[...]]`) into Hexo permanent links (based on the article’s `abbrlink` in front matter).

## Features

* Supports enabling/disabling the plugin via the `enable` switch (compatible with the misspelling `enbale`)
* Converts `[[Title]]` → `[Title](/posts/<abbrlink>)`
* Supports `[[Title|Alias]]`
* Supports `[[Title#Anchor]]` and `[[Title#Anchor|Alias]]`
* Configurable domain prefix for generating absolute URLs
* Converts during the `before_post_render` stage and only modifies compiled content without changing the source Markdown files
* Does not replace `[[...]]` inside fenced code blocks or inline code
* Built-in automated tests (`npm test`)

## Installation

Install in the Hexo root directory (for local development, you can use `npm link` or the `file:` method).

```bash
npm install hexo-obsidian-link-converter
```

## Configuration

Add the following to your Hexo `_config.yml`:

```yml
obsidian_link_converter:
  # Optional: whether to enable the plugin (default: true)
  # Compatible with the old misspelling "enbale"
  enable: true
  # Optional: output absolute URLs if configured
  # Example: https://example.com/blog
  domain_prefix: ""
  # Optional: enable debug logging
  debug: false
```

## Matching Rules

* Target article matching priority: `title` → `slug`
* Conversion only occurs if the target article contains `abbrlink`
* If no target is found, the original `[[...]]` is preserved

## Output Examples

Assume the article **Hello Hexo** has `abbrlink: abcd1234`

* `[[Hello Hexo]]` → `[Hello Hexo](/posts/abcd1234)`
* `[[Hello Hexo|Click Me]]` → `[Click Me](/posts/abcd1234)`
* `[[Hello Hexo#Section A]]` → `[Hello Hexo](/posts/abcd1234#Section%20A)`

If `domain_prefix: https://example.com`

* `[[Hello Hexo]]` → `[Hello Hexo](https://example.com/posts/abcd1234)`
