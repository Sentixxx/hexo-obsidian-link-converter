'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const plugin = require('../index');
const internal = plugin._internal;

function createHexoMock(options) {
  const posts = options.posts || [];
  const config = options.config || {};

  let postsGetCount = 0;
  const handlers = new Map();

  const hexo = {
    config,
    locals: {
      get(name) {
        if (name === 'posts') {
          postsGetCount += 1;
          return {
            toArray() {
              return posts;
            }
          };
        }
        return null;
      }
    },
    extend: {
      filter: {
        register(name, fn) {
          handlers.set(name, fn);
        }
      }
    }
  };

  return {
    hexo,
    handlers,
    getPostsGetCount() {
      return postsGetCount;
    }
  };
}

test('converts wiki links to abbrlink permalink with optional domain prefix', () => {
  const ctx = createHexoMock({
    config: { obsidian_link_converter: { domain_prefix: 'https://example.com/blog/' } },
    posts: [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }]
  });

  plugin(ctx.hexo);
  const beforeGenerate = ctx.handlers.get('before_generate');
  const beforePostRender = ctx.handlers.get('before_post_render');
  beforeGenerate();

  const result = beforePostRender({
    content: '[[Hello Hexo]] [[Hello Hexo|Click]] [[hello-hexo#Section A]] [[Missing]]'
  }).content;

  assert.equal(
    result,
    '[Hello Hexo](https://example.com/blog/posts/abcd1234) [Click](https://example.com/blog/posts/abcd1234) [hello-hexo](https://example.com/blog/posts/abcd1234#Section%20A) [[Missing]]'
  );
});

test('does not replace wiki links inside fenced code and inline code', () => {
  const index = {
    byTitle: new Map([['hello hexo', { abbrlink: 'abcd1234' }]]),
    bySlug: new Map()
  };
  const replacer = internal.createWikiLinkReplacer(index, '');

  const input = [
    'normal [[Hello Hexo]]',
    '`inline [[Hello Hexo]]`',
    '```md',
    '[[Hello Hexo]]',
    '```',
    'tail [[Hello Hexo|Alias]]'
  ].join('\n');

  const output = internal.replaceOutsideCode(input, replacer);

  assert.equal(
    output,
    [
      'normal [Hello Hexo](/posts/abcd1234)',
      '`inline [[Hello Hexo]]`',
      '```md',
      '[[Hello Hexo]]',
      '```',
      'tail [Alias](/posts/abcd1234)'
    ].join('\n')
  );
});

test('builds index once per generate cycle and reuses cache during rendering', () => {
  const ctx = createHexoMock({
    config: { obsidian_link_converter: {} },
    posts: [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }]
  });

  plugin(ctx.hexo);
  const beforeGenerate = ctx.handlers.get('before_generate');
  const beforePostRender = ctx.handlers.get('before_post_render');

  beforeGenerate();
  beforePostRender({ content: '[[Hello Hexo]]' });
  beforePostRender({ content: '[[hello-hexo]]' });

  assert.equal(ctx.getPostsGetCount(), 1);
});

test('rebuilds index when cached index is empty', () => {
  const posts = [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }];
  const ctx = createHexoMock({
    config: { obsidian_link_converter: {} },
    posts: []
  });

  plugin(ctx.hexo);
  const beforeGenerate = ctx.handlers.get('before_generate');
  const beforePostRender = ctx.handlers.get('before_post_render');

  beforeGenerate();
  ctx.hexo.locals.get = function get(name) {
    if (name === 'posts') {
      return {
        toArray() {
          return posts;
        }
      };
    }
    return null;
  };

  const result = beforePostRender({ content: '[[Hello Hexo]]' }).content;
  assert.equal(result, '[Hello Hexo](/posts/abcd1234)');
});

test('matches obsidian links containing folder path and markdown extension', () => {
  const ctx = createHexoMock({
    config: { obsidian_link_converter: {} },
    posts: [
      {
        title: '记一次个人博客安装配置',
        slug: 'blog-setup',
        source: '_posts/经验/记一次个人博客的安装配置(Obsidian + Hexo + Github Page).md',
        abbrlink: 'k3h1d8'
      }
    ]
  });

  plugin(ctx.hexo);
  const beforeGenerate = ctx.handlers.get('before_generate');
  const beforePostRender = ctx.handlers.get('before_post_render');

  beforeGenerate();
  const result = beforePostRender({
    content: '[[经验/记一次个人博客的安装配置(Obsidian + Hexo + Github Page).md]]'
  }).content;

  assert.equal(result, '[经验/记一次个人博客的安装配置(Obsidian + Hexo + Github Page).md](/posts/k3h1d8)');
});

test('matches when post.source includes source/_posts prefix', () => {
  const ctx = createHexoMock({
    config: { obsidian_link_converter: {} },
    posts: [
      {
        title: '记一次个人博客安装配置',
        slug: 'blog-setup',
        source: 'source/_posts/经验/记一次个人博客的安装配置(Obsidian + Hexo + Github Page).md',
        abbrlink: '44007'
      }
    ]
  });

  plugin(ctx.hexo);
  const beforeGenerate = ctx.handlers.get('before_generate');
  const afterPostRender = ctx.handlers.get('after_post_render');

  beforeGenerate();
  const result = afterPostRender({
    content:
      '<p><a href="../%E7%BB%8F%E9%AA%8C/%E8%AE%B0%E4%B8%80%E6%AC%A1%E4%B8%AA%E4%BA%BA%E5%8D%9A%E5%AE%A2%E7%9A%84%E5%AE%89%E8%A3%85%E9%85%8D%E7%BD%AE(Obsidian%20+%20Hexo%20+%20Github%20Page).md">x</a></p>'
  }).content;

  assert.equal(result, '<p><a href="/posts/44007">x</a></p>');
});

test('rewrites rendered html links that still point to markdown files', () => {
  const ctx = createHexoMock({
    config: { obsidian_link_converter: {} },
    posts: [
      {
        title: '记一次个人博客安装配置',
        slug: 'blog-setup',
        source: '_posts/经验/记一次个人博客的安装配置(Obsidian + Hexo + Github Page).md',
        abbrlink: '44007'
      }
    ]
  });

  plugin(ctx.hexo);
  const beforeGenerate = ctx.handlers.get('before_generate');
  const afterPostRender = ctx.handlers.get('after_post_render');

  beforeGenerate();
  const result = afterPostRender({
    content:
      '<p><a href="../%E7%BB%8F%E9%AA%8C/%E8%AE%B0%E4%B8%80%E6%AC%A1%E4%B8%AA%E4%BA%BA%E5%8D%9A%E5%AE%A2%E7%9A%84%E5%AE%89%E8%A3%85%E9%85%8D%E7%BD%AE(Obsidian%20+%20Hexo%20+%20Github%20Page).md">x</a></p>'
  }).content;

  assert.equal(result, '<p><a href="/posts/44007">x</a></p>');
});

test('rewrites markdown links that still point to markdown files in after_post_render', () => {
  const ctx = createHexoMock({
    config: { obsidian_link_converter: {} },
    posts: [
      {
        title: '记一次个人博客安装配置',
        slug: 'blog-setup',
        source: '_posts/经验/记一次个人博客的安装配置(Obsidian + Hexo + Github Page).md',
        abbrlink: '44007'
      }
    ]
  });

  plugin(ctx.hexo);
  const beforeGenerate = ctx.handlers.get('before_generate');
  const afterPostRender = ctx.handlers.get('after_post_render');

  beforeGenerate();
  const result = afterPostRender({
    content:
      '[记一次个人博客的安装配置(Obsidian + Hexo + Github Page)](../%E7%BB%8F%E9%AA%8C/%E8%AE%B0%E4%B8%80%E6%AC%A1%E4%B8%AA%E4%BA%BA%E5%8D%9A%E5%AE%A2%E7%9A%84%E5%AE%89%E8%A3%85%E9%85%8D%E7%BD%AE(Obsidian%20+%20Hexo%20+%20Github%20Page).md)'
  }).content;

  assert.equal(result, '[记一次个人博客的安装配置(Obsidian + Hexo + Github Page)](/posts/44007)');
});

test('auto-registers filters when loaded by Hexo global context', () => {
  const ctx = createHexoMock({
    config: { obsidian_link_converter: {} },
    posts: [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }]
  });

  const modulePath = require.resolve('../index');
  const previousGlobalHexo = globalThis.hexo;
  let loadedPlugin;

  try {
    delete require.cache[modulePath];
    globalThis.hexo = ctx.hexo;

    loadedPlugin = require('../index');
    const beforePostRender = ctx.handlers.get('before_post_render');
    const result = beforePostRender({ content: '[[Hello Hexo]]' }).content;
    assert.equal(result, '[Hello Hexo](/posts/abcd1234)');
  } finally {
    globalThis.hexo = previousGlobalHexo;
    delete require.cache[modulePath];
    require('../index');
  }

  assert.equal(typeof loadedPlugin, 'function');
});

test('does not register filters when plugin is disabled by enable flag', () => {
  const disabledByEnable = createHexoMock({
    config: { obsidian_link_converter: { enable: false } },
    posts: [{ title: 'Hello Hexo', slug: 'hello-hexo', abbrlink: 'abcd1234' }]
  });
  plugin(disabledByEnable.hexo);
  assert.equal(disabledByEnable.handlers.size, 0);
});
