// Utility functions for bottle name extraction
if (!window.extractors) {
  window.extractors = {

    // Extract from JSON-LD 
    getFromJsonLD() {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          // Handle both single object and array of objects
          const products = Array.isArray(data) ? data : [data];
          for (const item of products) {
            if (item['@type'] === 'Product' && item.name) {
              return item.name.trim();
            }
          }
        } catch (e) {
          console.log('JSON-LD parsing error:', e);
        }
      }
      return null;
    },

    // Extract from Microdata
    getFromMicrodata() {
      const element = document.querySelector('[itemprop="name"]');
      return element ? element.textContent.trim() : null;
    },

    // Extract from OpenGraph
    getFromOpenGraph() {
      const metaTag = document.querySelector('meta[property="og:title"]');
      return metaTag ? metaTag.getAttribute('content').trim() : null;
    },

    // Extract from title tag (with cleaning)


    // Extract from main heading
    getFromHeading() {
      const h1 = document.querySelector('h1');
      if (h1 && !h1.closest('header, nav')) {
        return h1.textContent.trim();
      }
      const h2 = document.querySelector('h2');
      if (h2 && !h2.closest('header, nav')) {
        return h2.textContent.trim();
      }
      return null;
    },

    // Extract from common product page markers
    getFromCommonMarkers() {
      const selectors = [
        '[aria-label*="product"]',
        '[class*="product-name"]', '[id*="product-name"]',
        '[class*="productName"]', '[id*="productName"]',
        '[class*="title"]', '[id*="title"]',
        '[class*="product-title"]', '[id*="product-title"]',
        '[data-testid*="product"]', '[data-testid*="title"]',
        '.name', '#name'
      ];
      for (const selector of selectors) {
        try {
          const element = document.querySelector(selector);
          if (element && !element.closest('header, nav')) {
            const text = element.textContent.trim();
            if (text.length > 0 && text.length < 200) { // Reasonable length for a product name
              return text;
            }
          }
        } catch (e) {
          console.log('Selector error:', e);
        }
      }
      return null;
    },
    getFromTitle() {

      let attempts = 0;
      let title = null;

      const interval = setInterval(() => {
        title = document.title;
        attempts++;

        if (title || attempts >= 10) {
          clearInterval(interval);
          if (!title) {
            console.log('Title not found after 10 attempts.');
            return null;
          } else {
            console.log('Title found:', title);
            // you can use `title` here
          }
        }
      }, 1000);


      // Get domain name without TLD for cleaning
      const domain = window.location.hostname.replace('www.', '').split('.')[0];
      // Try to get a site name from domain (capitalize, remove dashes)
      let siteName = domain.replace(/[-_]/g, ' ');
      siteName = siteName.replace(/\b\w/g, c => c.toUpperCase());
      // Also add uppercase and lowercase variants for robust cleaning
      const siteNameVariants = [siteName, siteName.toLowerCase(), siteName.toUpperCase()];

      // First, aggressively clean the title of the site name and common separators
      let cleanedTitle = title;

      // Clean site name variants first
      siteNameVariants.forEach(variant => {
        // Remove site name with common prefixes/suffixes
        const sitePatterns = [
          `${variant}[ ]*[-|•·:]`,  // BAXUS - 
          `[-|•·:][ ]*${variant}`,  //  - BAXUS
          `${variant}[ ]*[|]`,      // BAXUS |
          `[|][ ]*${variant}`,      // | BAXUS
          `${variant}[ ]*`,         // BAXUS 
          `[ ]*${variant}`          //  BAXUS
        ];
        sitePatterns.forEach(pattern => {
          cleanedTitle = cleanedTitle.replace(new RegExp(pattern, 'gi'), '');
        });
      });

      // Clean common separators and their surrounding whitespace
      cleanedTitle = cleanedTitle
        .replace(/[\s]*[-|•·:]+[\s]*/g, ' ')  // Replace any remaining separators with space
        .replace(/^[-|•·:\s]+|[-|•·:\s]+$/g, '')  // Remove separators at start/end
        .trim();

      // Remove common shopping/website terms
      const blacklist = [
        domain,
        ...siteNameVariants,
        'store', 'shop', 'home', 'cart', 'checkout', 'buy', 'online',
        'retailer', 'wine', 'spirits', 'whiskey', 'whisky', 'vodka',
        'gin', 'rum', 'tequila', 'liqueur', 'beer', 'bottle', 'product',
        'brand', 'official', 'site', 'marketplace'
      ];

      // Remove blacklisted words
      blacklist.forEach(word => {
        const wordPattern = new RegExp(`\\b${word}\\b`, 'gi');
        cleanedTitle = cleanedTitle.replace(wordPattern, '');
      });

      // Final cleanup of any remaining artifacts
      cleanedTitle = cleanedTitle
        .replace(/\s+/g, ' ')  // Normalize spaces
        .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')  // Remove non-alphanumeric chars at start/end
        .trim();

      return cleanedTitle || null;
    }
  };
}

var extractors = window.extractors;

// Function to clean extracted bottle names
function cleanExtractedName(name) {
  if (!name) return null;
  const domain = window.location.hostname.replace('www.', '').split('.')[0];
  let siteName = domain.replace(/[-_]/g, ' ');
  siteName = siteName.replace(/\b\w/g, c => c.toUpperCase());
  const siteNameVariants = [siteName, siteName.toLowerCase(), siteName.toUpperCase()];
  let cleaned = name;
  // Remove site name variants
  siteNameVariants.forEach(variant => {
    const sitePatterns = [
      `${variant}[ ]*[-|•·:]`,
      `[-|•·:][ ]*${variant}`,
      `${variant}[ ]*[|]`,
      `[|][ ]*${variant}`,
      `${variant}[ ]*`,
      `[ ]*${variant}`
    ];
    sitePatterns.forEach(pattern => {
      cleaned = cleaned.replace(new RegExp(pattern, 'gi'), '');
    });
  });
  // Clean common separators and their surrounding whitespace
  cleaned = cleaned
    .replace(/[\s]*[-|•·:]+[\s]*/g, ' ')
    .replace(/^[-|•·:\s]+|[-|•·:\s]+$/g, '')
    .trim();
  // Remove common shopping/website terms
  const blacklist = [
    domain,
    ...siteNameVariants,
    'store', 'shop', 'home', 'cart', 'checkout', 'buy', 'online',
    'retailer', 'wine', 'spirits', 'whiskey', 'whisky', 'vodka',
    'gin', 'rum', 'tequila', 'liqueur', 'beer', 'bottle', 'product',
    'brand', 'official', 'site', 'marketplace'
  ];
  blacklist.forEach(word => {
    const wordPattern = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(wordPattern, '');
  });
  cleaned = cleaned
    .replace(/\s+/g, ' ')
    .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '')
    .trim();
  return cleaned || null;
}

// Function to extract price information from the current page
function extractPriceInfo(productTitle) {
  // --- 1. JSON-LD Structured Data ---
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent);
      const products = Array.isArray(data) ? data : [data];
      for (const item of products) {
        if (item['@type'] === 'Product' && item.offers && item.offers.price) {
          return {
            price: parseFloat(item.offers.price),
            currency: item.offers.priceCurrency || null,
            method: 'JSON-LD'
          };
        }
      }
    } catch (e) { }
  }

  // --- 2. Microdata (itemprop="price") ---
  const priceElem = document.querySelector('[itemprop="price"]');
  if (priceElem) {
    let price = priceElem.getAttribute('content') || priceElem.textContent;
    price = price ? price.replace(/[^\d.,]/g, '') : null;
    let currency = null;
    const currencyElem = document.querySelector('[itemprop="priceCurrency"]');
    if (currencyElem) currency = currencyElem.getAttribute('content') || currencyElem.textContent;
    return {
      price: price ? parseFloat(price.replace(/,/g, '')) : null,
      currency: currency || null,
      method: 'Microdata'
    };
  }

  // --- 3. Open Graph Meta Tags ---
  const ogPrice = document.querySelector('meta[property="og:price:amount"]');
  if (ogPrice) {
    const price = ogPrice.getAttribute('content');
    const currencyTag = document.querySelector('meta[property="og:price:currency"]');
    const currency = currencyTag ? currencyTag.getAttribute('content') : null;
    return {
      price: price ? parseFloat(price.replace(/,/g, '')) : null,
      currency: currency || null,
      method: 'OpenGraph'
    };
  }

  // --- 4. CSS Selector Heuristics ---
  const priceElems = Array.from(document.querySelectorAll('[class],[id]')).filter(el => {
    return (
      (el.className && typeof el.className === 'string' && /price/i.test(el.className)) ||
      (el.id && /price/i.test(el.id))
    );
  });
  for (const elem of priceElems) {
    if (elem && elem.textContent) {
      const match = elem.textContent.match(/([\$€£])\s?([\d,.]+)/);
      if (match) {
        return {
          price: parseFloat(match[2].replace(/,/g, '')),
          currency: mapCurrencySymbol(match[1]),
          method: 'CSSSelector'
        };
      }
    }
  }

  // --- 5. Heuristic Currency Regex Scanning (after element containing product title) ---
  let titleNode = null;
  if (productTitle) {
    // Use the first two words of the product title for matching (in any order)
    const words = productTitle.trim().split(/\s+/);
    const firstTwo = words.slice(0, 2).map(w => w.toLowerCase());
    if (firstTwo.length === 2) {
      const tagList = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'b', 'strong', 'div', 'li', 'a'];
      const allNodes = Array.from(document.querySelectorAll(tagList.join(',')));
      for (const node of allNodes) {
        if (node.textContent) {
          const text = node.textContent.toLowerCase();
          if (firstTwo.every(word => text.includes(word))) {
            titleNode = node;
            break;
          }
        }
      }
    }
  }
  // Only scan elements after the title node
  let scanStart = false;
  let priceFound = null;
  let currencyFound = null;
  if (titleNode) {
    // Get all elements in document order
    const allElems = Array.from(document.querySelectorAll('body *'));
    for (const node of allElems) {
      if (node === titleNode) {
        scanStart = true;
        continue;
      }
      if (scanStart && node.textContent) {
        // Look for price patterns like $20, 20€, £39.99
        const match = node.textContent.match(/([\$€£¥₩₹₽₺₫₪₱₦₴₲₡₵₸₮₼₾₿])\s?([\d,.]+)/);
        if (match) {
          priceFound = match[2].replace(/,/g, '');
          currencyFound = match[1];
          break;
        }
      }
    }
    if (priceFound) {
      return {
        price: parseFloat(priceFound),
        currency: mapCurrencySymbol(currencyFound),
        method: 'RegexAfterTitleElement'
      };
    }
  }

  // --- 6. Complex Nested Structure Price Detection ---
  const elements = document.querySelectorAll('*');
  for (const element of elements) {
    try {
      // Skip elements that are clearly not price-related
      if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' ||
        element.tagName === 'META' || element.tagName === 'LINK') {
        continue;
      }

      const elementText = element.textContent;
      if (!elementText || elementText.length > 100) continue; // Skip long text blocks

      // Check if element contains both a currency (symbol or code) and numbers
      if ((/[₦$€£¥₩₹₽₺₫₪₱₴₲₡₵₸₮₼₾₿]/.test(elementText) ||
        /\b(?:USD|EUR|GBP|JPY|NGN|KRW|INR|RUB|TRY|VND|ILS|PHP|UAH|PYG|CRC|GHS|KZT|MNT|AZN|GEL)\b/i.test(elementText)) &&
        /\d/.test(elementText)) {

        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
          null
        );

        let currencyNode = null;
        let numberNode = null;
        let currencyValue = null;

        while (walker.nextNode()) {
          const node = walker.currentNode;
          const text = node.nodeType === Node.TEXT_NODE ?
            node.textContent :
            node.innerText || node.textContent;

          if (!text) continue;

          // Look for currency symbol or 3-letter code
          const symbolMatch = text.match(/[₦$€£¥₩₹₽₺₫₪₱₴₲₡₵₸₮₼₾₿]/);
          const codeMatch = text.match(/\b(USD|EUR|GBP|JPY|NGN|KRW|INR|RUB|TRY|VND|ILS|PHP|UAH|PYG|CRC|GHS|KZT|MNT|AZN|GEL)\b/i);

          if ((symbolMatch || codeMatch) && !currencyNode) {
            currencyNode = node;
            currencyValue = symbolMatch ? symbolMatch[0] : codeMatch[1];
          }

          // Look for number in a different node
          const numberMatch = text.match(/[\d,]+\.?\d*/);
          if (numberMatch && !numberNode &&
            (!currencyNode || !text.includes(currencyValue))) {
            numberNode = node;
          }

          // If we found both in different nodes, and they're reasonably close to each other
          if (currencyNode && numberNode && currencyNode !== numberNode) {
            const price = parseFloat(numberMatch[0].replace(/,/g, ''));
            if (!isNaN(price) && price > 0) {
              // If we found a 3-letter code, use it directly, otherwise map the symbol
              const currency = codeMatch ? codeMatch[1].toUpperCase() : mapCurrencySymbol(currencyValue);
              return {
                price: price,
                currency: currency,
                method: 'ComplexNestedStructure'
              };
            }
          }
        }
      }
    } catch (e) {
      console.log('Complex structure parsing error:', e);
    }
  }

  // --- 7. Not found ---
  return { price: null, currency: null, method: null };
}

function mapCurrencySymbol(symbol) {
  if (!symbol) return null;
  switch (symbol) {
    case '$': return 'USD';
    case '€': return 'EUR';
    case '£': return 'GBP';
    case '¥': return 'JPY';
    case '₩': return 'KRW';
    case '₹': return 'INR';
    case '₽': return 'RUB';
    case '₺': return 'TRY';
    case '₫': return 'VND';
    case '₪': return 'ILS';
    case '₱': return 'PHP';
    case '₦': return 'NGN';
    case '₴': return 'UAH';
    case '₲': return 'PYG';
    case '₡': return 'CRC';
    case '₵': return 'GHS';
    case '₸': return 'KZT';
    case '₮': return 'MNT';
    case '₼': return 'AZN';
    case '₾': return 'GEL';
    case '₿': return 'BTC';
    default:
      // Try to match 3-letter ISO code if symbol is not recognized
      if (/^[A-Z]{3}$/i.test(symbol)) return symbol.toUpperCase();
      return symbol;
  }
}

// Function to fetch exchange rate to USD
async function getExchangeRateToUSD(currency) {
  if (!currency || currency.toLowerCase() === 'usd') return 1;
  try {
    const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json');
    if (!res.ok) throw new Error('Exchange rate fetch failed');
    const data = await res.json();
    // The API gives rates as: { usd: { eur: 0.93, gbp: 0.80, ... } }
    const lower = currency.toLowerCase();
    if (data && data.usd && data.usd[lower]) {
      // We want 1 GBP to USD, but API gives 1 USD to GBP, so invert
      const rate = 1 / data.usd[lower];
      return rate;
    }
  } catch (e) {
    console.log('Honey Barrel: Exchange rate fetch error:', e);
  }
  return null;
}

// Function to extract bottle information from the current page
async function extractBottleInfo() {
  if (!window || !window.location || !window.location.hostname) return null;

  // Try each extraction method in order of reliability
  let bottleName = null;
  let extractionMethod = null;
  const extractionOrder = [
    { fn: extractors.getFromJsonLD, name: 'JSON-LD' },
    { fn: extractors.getFromMicrodata, name: 'Microdata' },
    { fn: extractors.getFromOpenGraph, name: 'OpenGraph' },
    { fn: extractors.getFromTitle, name: 'Title' },
    { fn: extractors.getFromCommonMarkers, name: 'CommonMarkers' },
    { fn: extractors.getFromHeading, name: 'Heading' }
  ];

  for (const method of extractionOrder) {
    const result = method.fn();
    if (result) {
      bottleName = cleanExtractedName(result);
      extractionMethod = method.name;
      break;
    }
  }

  if (!bottleName) {
    console.log('Honey Barrel: Could not extract bottle name');
    return null;
  }

  console.log(`Honey Barrel: Extracted bottle name: ${bottleName} (via ${extractionMethod})`);

  // --- Gamification: Send PRODUCT_VIEWED message ---
  // Send this message as soon as a bottle name is confirmed, before price extraction
  try {
    if (chrome?.runtime?.id) {
      chrome.runtime.sendMessage({ type: 'PRODUCT_VIEWED', url: window.location.href }).catch(err => {
        // Ignore error if background script is not ready or context invalidated
        if (err.message !== 'Could not establish connection. Receiving end does not exist.') {
          console.warn("Honey Barrel: Error sending PRODUCT_VIEWED message:", err);
        }
      });
    }
  } catch (e) {
    console.warn("Honey Barrel: Could not send PRODUCT_VIEWED message", e);
  }
  // --- End Gamification ---

  // Try to extract price info
  const priceInfo = extractPriceInfo(bottleName);
  let convertedUsdPrice = null;

  // Only try currency conversion if we found a price
  if (priceInfo.price && priceInfo.currency && priceInfo.currency !== 'USD') {
    const rate = await getExchangeRateToUSD(priceInfo.currency);
    if (rate) {
      convertedUsdPrice = priceInfo.price * rate;
      console.log(`Honey Barrel: Converted price: $${convertedUsdPrice.toFixed(2)} USD (rate: ${rate})`);
    } else {
      console.log('Honey Barrel: Could not fetch exchange rate for', priceInfo.currency);
    }
  }

  // Return bottle info even if price extraction failed
  return {
    bottleName,
    price: priceInfo.price || null,
    currency: priceInfo.currency || null,
    priceExtractionMethod: priceInfo.method || 'none',
    url: window.location.href,
    convertedUsdPrice: convertedUsdPrice,
    normalizedName: normalizeBottleName(bottleName) // Add normalized name here
  };
}

// Throttle function to limit how often a function can be called
function throttle(func, limit) {
  let inThrottle;
  return function () {
    const args = arguments;
    const context = this;

    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Function to normalize bottle names for better matching
function normalizeBottleName(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\b(the|limited|edition|release|single|barrel|cask|strength|proof|year|old|aged|distillery|winery|vineyard|chateau|domaine)\b/g, '') // Remove common terms
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

// Check if an element is in the viewport
function isInViewport(element) {
  const rect = element.getBoundingClientRect();
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// Function to handle bottle search and display results
async function checkAndDisplayMatches(bottleInfo) {
  try {
    if (!chrome?.runtime?.id) {
      console.log('Extension context invalidated');
      return;
    }

    const existingRect = document.getElementById('baxus-match-rect');
    if (!existingRect) {
      // Create the tag
      const rect = document.createElement('div');
      rect.id = 'baxus-match-rect';

      // Simple tag with just the logo
      rect.innerHTML = `
        <img src="https://www.baxus.co/favicon.ico" style="height: 17px; width: 20px;" />
      `;

      rect.style.position = 'fixed';
      rect.style.right = '0';
      rect.style.top = '50%';
      rect.style.transform = 'translateY(-50%)';
      rect.style.background = '#212121';
      rect.style.padding = '8px';
      rect.style.borderRadius = '4px 0 0 4px';
      rect.style.boxShadow = '0 2px 8px rgba(0,0,0,0.13)';
      rect.style.zIndex = '2147483647';
      rect.style.cursor = 'pointer';
      rect.style.transition = 'opacity 0.2s';
      rect.style.opacity = '0.97';
      rect.style.display = 'flex';
      rect.style.alignItems = 'center';
      rect.style.justifyContent = 'center';

      // Show on hover
      rect.addEventListener('mouseenter', () => { rect.style.opacity = '1'; });
      rect.addEventListener('mouseleave', () => { rect.style.opacity = '0.97'; });

      // Open the extension popup on click
      rect.addEventListener('click', () => {
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
        }
      });

      document.body.appendChild(rect);

      //-------------------
      // Create the rectangle
      const rect2 = document.createElement('div');
      rect2.id = 'baxus-match-rect2';

      // Flex layout: single line with text + logo
      rect2.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center;">
          <span style="color: white; white-space: nowrap;">
            ${response.matches.length > 0 ? `${response.matches.length} drink${response.matches.length === 1 ? '' : 's'} found` : 'Search'}
          </span>
          <img src="https://www.baxus.co/assets/icons/Baxus_Full_Logo_Gold_White.svg" style="height: 16px; margin-left: 8px;" />
        </div>
      `;

      rect2.style.position = 'fixed';
      rect2.style.left = '50%';
      rect2.style.bottom = '32px';
      rect2.style.transform = 'translateX(-50%)';
      rect2.style.background = '#212121';
      rect2.style.color = '#fff';
      rect2.style.fontWeight = 'bold';
      rect2.style.fontSize = '16px';
      rect2.style.padding = '12px 32px';
      rect2.style.borderRadius = '16px';
      rect2.style.boxShadow = '0 4px 16px rgba(0,0,0,0.13)';
      rect2.style.zIndex = '2147483647';
      rect2.style.cursor = 'pointer';
      rect2.style.userSelect = 'none';
      rect2.style.transition = 'opacity 0.2s';
      rect2.style.opacity = '0.97';
      rect2.style.letterSpacing = '0.5px';
      rect2.style.textAlign = 'center';
      rect2.style.pointerEvents = 'auto';



      // Show on hover
      rect2.addEventListener('mouseenter', () => { rect2.style.opacity = '1'; });
      rect2.addEventListener('mouseleave', () => { rect2.style.opacity = '0.97'; });

      // Open the extension popup on click
      rect2.addEventListener('click', () => {
        if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
        }
      });

      document.body.appendChild(rect2);

    }
  } catch (error) {
    console.log('[Honey Barrel CS] Error in checkAndDisplayMatches:', error);
  }
}

// Add initialization flag at the top level
let isInitialized = false;
let initializationAttempts = 0;
const MAX_INIT_ATTEMPTS = 3;

// Initialize when page loads
function initialize() {
  if (isInitialized) {
    console.log("Honey Barrel content script already initialized");
    return;
  }

  initializationAttempts++;
  console.log("Honey Barrel content script initializing (attempt " + initializationAttempts + ")");

  // Verify extension context and retry if needed
  if (!chrome?.runtime?.id) {
    if (initializationAttempts < MAX_INIT_ATTEMPTS) {
      console.log("Extension context not ready, retrying in 1 second...");
      setTimeout(initialize, 1000);
      return;
    }
    console.log("Failed to initialize after " + MAX_INIT_ATTEMPTS + " attempts");
    return;
  }

  isInitialized = true;

  // Initial setup of the tag
  setTimeout(() => {
    checkAndDisplayMatches();
  }, 1500);
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request);

  if (request.type === 'GET_BOTTLE_INFO') {
    extractBottleInfo().then(bottleInfo => {
      console.log("Extracted bottle info:", bottleInfo);
      sendResponse({ bottleInfo });
    });
    return true; // Important to keep the message channel open
  }

  return true;
});

// Run initialization
initialize();
