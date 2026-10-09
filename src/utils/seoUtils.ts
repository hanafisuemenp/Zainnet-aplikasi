/**
 * SEO & Social Metadata Utility for ZAIN.NET Academic Hub & Blog Makalah
 * Implements OpenGraph, Twitter Cards, Canonical links, and Schema.org JSON-LD
 */

export interface SeoOptions {
  title: string;
  description: string;
  url?: string;
  type?: 'website' | 'article';
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
  jsonLd?: Record<string, any>;
}

const DEFAULT_TITLE = 'ZAIN.NET - Pusat Modul Skripsi, Makalah & Akademik Mahasiswa';
const DEFAULT_DESCRIPTION = 'Platform otomatisasi penulisan skripsi, artikel ilmiah, penomoran halaman baku, repositori blog makalah, dan tugas akhir mahasiswa.';

function setMetaTag(nameOrProperty: string, content: string, isProperty = false) {
  const selector = isProperty ? `meta[property="${nameOrProperty}"]` : `meta[name="${nameOrProperty}"]`;
  let element = document.querySelector(selector) as HTMLMetaElement;
  if (!element) {
    element = document.createElement('meta');
    if (isProperty) {
      element.setAttribute('property', nameOrProperty);
    } else {
      element.setAttribute('name', nameOrProperty);
    }
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function setCanonicalUrl(url: string) {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

function setJsonLd(data: Record<string, any> | null) {
  let script = document.getElementById('seo-structured-data') as HTMLScriptElement;
  if (!data) {
    if (script) script.remove();
    return;
  }
  if (!script) {
    script = document.createElement('script');
    script.id = 'seo-structured-data';
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data, null, 2);
}

export function updatePageSeo(options: SeoOptions) {
  const origin = window.location.origin;
  const currentUrl = options.url || window.location.href;

  // Title
  document.title = options.title;

  // Standard Meta
  setMetaTag('description', options.description);

  // Canonical
  setCanonicalUrl(currentUrl);

  // Robots & Crawlers
  setMetaTag('robots', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
  setMetaTag('googlebot', 'index, follow, max-snippet:-1, max-image-preview:large');

  // OpenGraph
  setMetaTag('og:site_name', 'ZAIN.NET Academic Hub', true);
  setMetaTag('og:title', options.title, true);
  setMetaTag('og:description', options.description, true);
  setMetaTag('og:type', options.type || 'website', true);
  setMetaTag('og:url', currentUrl, true);

  if (options.type === 'article') {
    if (options.author) setMetaTag('article:author', options.author, true);
    if (options.publishedTime) setMetaTag('article:published_time', options.publishedTime, true);
    if (options.section) setMetaTag('article:section', options.section, true);
    if (options.tags && options.tags.length > 0) {
      setMetaTag('article:tag', options.tags.join(', '), true);
    }

    // Google Scholar Citation Tags for academic authority
    setMetaTag('citation_title', options.title);
    if (options.author) setMetaTag('citation_author', options.author);
    if (options.publishedTime) {
      setMetaTag('citation_publication_date', options.publishedTime.split('T')[0]);
      setMetaTag('citation_online_date', options.publishedTime.split('T')[0]);
    }
    setMetaTag('citation_language', 'id');
  }

  // Twitter Cards
  setMetaTag('twitter:card', 'summary_large_image');
  setMetaTag('twitter:title', options.title);
  setMetaTag('twitter:description', options.description);

  // JSON-LD Structured Data
  if (options.jsonLd) {
    setJsonLd(options.jsonLd);
  } else if (options.type === 'article') {
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'ScholarlyArticle',
      'headline': options.title,
      'name': options.title,
      'description': options.description,
      'articleSection': options.section || 'Akademik',
      'keywords': options.tags ? options.tags.join(', ') : 'makalah, skripsi, akademik',
      'inLanguage': 'id-ID',
      'author': {
        '@type': 'Person',
        'name': options.author || 'Penulis Mahasiswa'
      },
      'publisher': {
        '@type': 'Organization',
        'name': 'ZAIN.NET Academic Hub',
        'url': origin
      },
      'datePublished': options.publishedTime || new Date().toISOString(),
      'dateModified': options.modifiedTime || options.publishedTime || new Date().toISOString(),
      'mainEntityOfPage': {
        '@type': 'WebPage',
        '@id': currentUrl
      }
    });
  } else {
    // Default WebApplication / CollectionPage JSON-LD
    setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      'name': 'ZAIN.NET Academic Hub',
      'applicationCategory': 'EducationalApplication',
      'operatingSystem': 'All',
      'description': options.description,
      'url': origin
    });
  }
}

export function resetDefaultSeo() {
  updatePageSeo({
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    url: window.location.origin + window.location.pathname,
    type: 'website'
  });
}
