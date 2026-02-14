'use strict';

function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}

function normalizeBase(base) {
  const raw = String(base || '').trim();
  if (!raw) return '';
  return raw.replace(/\/+$/, '');
}

function stripMarkdownExtension(value) {
  return value.replace(/\.(md|markdown)$/i, '');
}

function normalizeLookupKey(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function stripLeadingDotSegments(value) {
  return value.replace(/^(\.\.\/|\.\/)+/, '');
}

function safeDecodeURI(value) {
  try {
    return decodeURIComponent(value);
  } catch (_err) {
    return value;
  }
}

function firstMatch(content, pattern) {
  const match = content.match(pattern);
  return match ? match[0] : '';
}

function parseWikiLink(raw) {
  const firstPipe = raw.indexOf('|');
  const targetAndAnchor = firstPipe >= 0 ? raw.slice(0, firstPipe) : raw;
  const alias = firstPipe >= 0 ? raw.slice(firstPipe + 1).trim() : '';

  const hashIndex = targetAndAnchor.indexOf('#');
  const target = hashIndex >= 0 ? targetAndAnchor.slice(0, hashIndex).trim() : targetAndAnchor.trim();
  const anchor = hashIndex >= 0 ? targetAndAnchor.slice(hashIndex + 1).trim() : '';

  return {
    target,
    anchor,
    alias
  };
}

function buildPostIndex(hexo) {
  let posts = [];
  if (hexo.model && typeof hexo.model === 'function') {
    const postModel = hexo.model('Post');
    if (postModel && typeof postModel.toArray === 'function') {
      posts = postModel.toArray();
    }
  }

  if (!posts.length && hexo.locals && typeof hexo.locals.get === 'function') {
    const postQuery = hexo.locals.get('posts');
    posts = postQuery ? postQuery.toArray() : [];
  }

  const byTitle = new Map();
  const bySlug = new Map();
  const bySourcePath = new Map();
  const bySourceBase = new Map();

  let indexedCount = 0;

  for (const post of posts) {
    if (!post || !post.abbrlink) continue;
    indexedCount += 1;

    if (post.title) {
      byTitle.set(String(post.title).trim().toLowerCase(), post);
    }

    if (post.slug) {
      bySlug.set(String(post.slug).trim().toLowerCase(), post);
    }

    if (post.source) {
      const normalizedSource = normalizeLookupKey(post.source).replace(/^.*?_posts\//, '');
      const sourceNoExt = stripMarkdownExtension(normalizedSource);
      const sourceBase = sourceNoExt.includes('/') ? sourceNoExt.slice(sourceNoExt.lastIndexOf('/') + 1) : sourceNoExt;

      if (sourceNoExt) {
        bySourcePath.set(sourceNoExt, post);
      }

      if (sourceBase) {
        bySourceBase.set(sourceBase, post);
      }
    }
  }

  return { byTitle, bySlug, bySourcePath, bySourceBase, indexedCount };
}

function buildTargetCandidates(target) {
  const normalized = normalizeLookupKey(stripLeadingDotSegments(target));
  if (!normalized) return [];

  const candidates = new Set();
  const noExt = stripMarkdownExtension(normalized);

  candidates.add(normalized);
  candidates.add(noExt);

  if (normalized.includes('/')) {
    const base = normalized.slice(normalized.lastIndexOf('/') + 1);
    candidates.add(base);
    candidates.add(stripMarkdownExtension(base));
  }

  return Array.from(candidates).filter(Boolean);
}

function resolvePostByTarget(index, target) {
  const candidates = buildTargetCandidates(target);

  for (const key of candidates) {
    const post =
      index.byTitle.get(key) ||
      index.bySlug.get(key) ||
      index.bySourcePath.get(key) ||
      index.bySourceBase.get(key);
    if (post) return post;
  }

  return null;
}

function replaceOutsideInlineCode(line, replacer) {
  let result = '';
  let cursor = 0;

  while (cursor < line.length) {
    const open = line.indexOf('`', cursor);
    if (open === -1) {
      result += replacer(line.slice(cursor));
      break;
    }

    result += replacer(line.slice(cursor, open));

    let ticks = 1;
    while (open + ticks < line.length && line[open + ticks] === '`') {
      ticks += 1;
    }

    const closingToken = '`'.repeat(ticks);
    const close = line.indexOf(closingToken, open + ticks);
    if (close === -1) {
      result += line.slice(open);
      break;
    }

    result += line.slice(open, close + ticks);
    cursor = close + ticks;
  }

  return result;
}

function replaceOutsideCode(content, replacer) {
  const lines = content.split('\n');
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^ {0,3}([`~]{3,})/);

    if (match) {
      const token = match[1];
      const marker = token[0];
      const length = token.length;

      if (!inFence) {
        inFence = true;
        fenceChar = marker;
        fenceLen = length;
      } else if (marker === fenceChar && length >= fenceLen) {
        inFence = false;
        fenceChar = '';
        fenceLen = 0;
      }

      continue;
    }

    if (!inFence) {
      lines[i] = replaceOutsideInlineCode(line, replacer);
    }
  }

  return lines.join('\n');
}

function createWikiLinkReplacer(index, domainPrefix) {
  return function replaceWikiLinks(segment) {
    return segment.replace(/\[\[([^\]]+)\]\]/g, (full, inner) => {
      const parsed = parseWikiLink(inner);
      if (!parsed.target) return full;

      const post = resolvePostByTarget(index, parsed.target);
      if (!post || !post.abbrlink) return full;

      const hrefPath = '/posts/' + trimSlashes(post.abbrlink);
      const href = domainPrefix ? domainPrefix + hrefPath : hrefPath;
      const anchor = parsed.anchor ? '#' + encodeURIComponent(parsed.anchor) : '';
      const text = parsed.alias || parsed.target;

      return '[' + text + '](' + href + anchor + ')';
    });
  };
}

function createHtmlMdHrefReplacer(index, domainPrefix) {
  return function replaceMdHref(html) {
    return html.replace(/(href\s*=\s*["'])([^"']+?\.md(?:#[^"']*)?)(["'])/gi, (full, prefix, rawHref, suffix) => {
      if (/^(https?:|mailto:|tel:|\/\/)/i.test(rawHref)) {
        return full;
      }

      const hashPos = rawHref.indexOf('#');
      const hrefWithoutHash = hashPos >= 0 ? rawHref.slice(0, hashPos) : rawHref;
      const hashRaw = hashPos >= 0 ? rawHref.slice(hashPos + 1) : '';

      const decodedTarget = safeDecodeURI(hrefWithoutHash);
      const post = resolvePostByTarget(index, decodedTarget);
      if (!post || !post.abbrlink) return full;

      const hrefPath = '/posts/' + trimSlashes(post.abbrlink);
      const href = domainPrefix ? domainPrefix + hrefPath : hrefPath;
      const anchor = hashRaw ? '#' + encodeURIComponent(safeDecodeURI(hashRaw)) : '';

      return prefix + href + anchor + suffix;
    });
  };
}

function createMarkdownMdLinkReplacer(index, domainPrefix) {
  return function replaceMarkdownMdLinks(markdownOrHtml) {
    return markdownOrHtml.replace(/\[([^\]]+)\]\(([^\n]+?\.md(?:#[^\n]+)?)\)/gi, (full, text, rawHref) => {
      if (/^(https?:|mailto:|tel:|\/\/)/i.test(rawHref)) {
        return full;
      }

      const hashPos = rawHref.indexOf('#');
      const hrefWithoutHash = hashPos >= 0 ? rawHref.slice(0, hashPos) : rawHref;
      const hashRaw = hashPos >= 0 ? rawHref.slice(hashPos + 1) : '';

      const decodedTarget = safeDecodeURI(hrefWithoutHash);
      const post = resolvePostByTarget(index, decodedTarget);
      if (!post || !post.abbrlink) return full;

      const hrefPath = '/posts/' + trimSlashes(post.abbrlink);
      const href = domainPrefix ? domainPrefix + hrefPath : hrefPath;
      const anchor = hashRaw ? '#' + encodeURIComponent(safeDecodeURI(hashRaw)) : '';

      return '[' + text + '](' + href + anchor + ')';
    });
  };
}

const registeredHexoInstances = new WeakSet();

function isPluginEnabled(pluginConfig) {
  if (Object.prototype.hasOwnProperty.call(pluginConfig, 'enable')) {
    return pluginConfig.enable !== false;
  }
  if (Object.prototype.hasOwnProperty.call(pluginConfig, 'enbale')) {
    return pluginConfig.enbale !== false;
  }
  return true;
}

function register(hexo) {
  if (!hexo || !hexo.extend || !hexo.extend.filter || typeof hexo.extend.filter.register !== 'function') {
    return;
  }
  if (registeredHexoInstances.has(hexo)) {
    return;
  }
  registeredHexoInstances.add(hexo);

  const pluginConfig = (hexo.config && hexo.config.obsidian_link_converter) || {};
  if (!isPluginEnabled(pluginConfig)) {
    return;
  }
  const domainPrefix = normalizeBase(pluginConfig.domain_prefix || '');
  const debug = Boolean(pluginConfig.debug);

  function debugLog(message, data) {
    if (!debug || !hexo.log || typeof hexo.log.info !== 'function') return;
    hexo.log.info('[obsidian-link-converter] ' + message, data || '');
  }

  let cachedIndex = null;
  function getIndex() {
    if (!cachedIndex || !cachedIndex.indexedCount) {
      cachedIndex = buildPostIndex(hexo);
      debugLog('index refreshed count=%s', String(cachedIndex.indexedCount || 0));
    }
    return cachedIndex;
  }

  hexo.extend.filter.register('before_generate', () => {
    cachedIndex = null;
    debugLog('index invalidated');
  });

  hexo.extend.filter.register('before_post_render', (data) => {
    if (!data || typeof data.content !== 'string' || !data.content.includes('[[')) {
      return data;
    }

    const beforeSample = firstMatch(data.content, /\[\[[^\]]+\]\]/);
    const index = getIndex();
    const replacer = createWikiLinkReplacer(index, domainPrefix);

    data.content = replaceOutsideCode(data.content, replacer);
    const afterSample = firstMatch(data.content, /\[[^\]]+\]\([^)]+\)/);
    debugLog('before_post_render source=%s before=%s after=%s', (data.source || data.path || 'unknown') + ' | ' + beforeSample + ' | ' + afterSample);
    return data;
  });

  hexo.extend.filter.register('after_post_render', (data) => {
    if (!data || typeof data.content !== 'string' || !data.content.includes('.md')) {
      return data;
    }

    const beforeMdSample = firstMatch(data.content, /\[[^\]]+\]\([^)]+\.md(?:#[^)]+)?\)/i);
    const beforeHtmlSample = firstMatch(data.content, /href\s*=\s*["'][^"']+\.md(?:#[^"']*)?["']/i);
    const index = getIndex();
    const replaceMarkdownMdLinks = createMarkdownMdLinkReplacer(index, domainPrefix);
    const replaceMdHref = createHtmlMdHrefReplacer(index, domainPrefix);
    data.content = replaceMdHref(replaceMarkdownMdLinks(data.content));
    const afterMdSample = firstMatch(data.content, /\[[^\]]+\]\([^)]+\/posts\/[^)]+\)/i);
    const afterHtmlSample = firstMatch(data.content, /href\s*=\s*["'][^"']+\/posts\/[^"']+["']/i);
    debugLog(
      'after_post_render source=%s beforeMd=%s beforeHref=%s afterMd=%s afterHref=%s',
      (data.source || data.path || 'unknown') + ' | ' + beforeMdSample + ' | ' + beforeHtmlSample + ' | ' + afterMdSample + ' | ' + afterHtmlSample
    );
    return data;
  });
}

const runtimeHexo =
  (typeof globalThis !== 'undefined' && globalThis.hexo) ||
  (typeof hexo !== 'undefined' ? hexo : undefined);
if (runtimeHexo) {
  register(runtimeHexo);
}

module.exports = register;

module.exports._internal = {
  buildPostIndex,
  buildTargetCandidates,
  createHtmlMdHrefReplacer,
  createMarkdownMdLinkReplacer,
  createWikiLinkReplacer,
  normalizeLookupKey,
  resolvePostByTarget,
  replaceOutsideCode,
  replaceOutsideInlineCode,
  parseWikiLink,
  safeDecodeURI,
  register,
  registeredHexoInstances,
  isPluginEnabled,
  stripLeadingDotSegments,
  stripMarkdownExtension
};
