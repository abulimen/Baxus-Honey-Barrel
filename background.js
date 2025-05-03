// Background script for Honey Barrel extension

// Import IndexedDB helper functions
import { getWatchlistItems, saveToWatchlist, saveNotification, getCachedApiResponse, saveApiResponseToCache, clearExpiredCache } from "./db.js";
// Import Gamification logic
import {
  addPoints, updateStreak, isProductViewThrottled, isSearchPointsThrottled,
  getUserStats, POINTS, recordProductView, recordWatchlistAdd, recordMatchFound,
  recordDealShare, checkAndAwardBadges, BADGES // Added badge-related imports
} from "./gamification.js";

const BAXUS_API_URL = "https://services.baxus.co/api/search/listings";

const WATCHLIST_CHECK_ALARM_NAME = "watchlistPriceCheck";
const ALARM_PERIOD_MINUTES = 60; // Check once per hour
const MAX_RETRIES = 3;
const RETRY_DELAY = 3600;

// Notification controls
const MIN_PRICE_CHANGE_PERCENT = 2; // Only notify if price changes by at least 2%
const MIN_PRICE_CHANGE_ABSOLUTE = 5; // Or by at least $10

// Track best deals found (persisted in chrome.storage.local)
const BEST_DEALS_KEY = 'honeyBarrelBestDeals';

// Helper function to get the best deals map
async function getBestDeals() {
    const result = await chrome.storage.local.get(BEST_DEALS_KEY);
    return result[BEST_DEALS_KEY] || {};
}

// Helper function to save the best deals map
async function saveBestDeals(bestDeals) {
    await chrome.storage.local.set({ [BEST_DEALS_KEY]: bestDeals });
}

// Helper function to update best deal price for an item
async function updateBestDealPrice(itemId, price, variantId = null) {
    const bestDeals = await getBestDeals();
    if (!bestDeals[itemId] || price < bestDeals[itemId].price) {
        bestDeals[itemId] = {
            price: price,
            timestamp: Date.now(),
            variantId: variantId
        };
        await saveBestDeals(bestDeals);
        return true; // Price was better than previous best
    }
    return false; // Price was not better than previous best
}

// Initialize best deals storage on install
async function initializeBestDeals() {
    const watchlistItems = await getWatchlistItems();
    const bestDeals = await getBestDeals();
    
    // Initialize best deals for any watchlist items that don't have them
    for (const item of watchlistItems) {
        if (!bestDeals[item.id]) {
            bestDeals[item.id] = {
                price: item.lastSeenPrice,
                timestamp: Date.now(),
                variantId: null
            };
        }
    }
    
    await saveBestDeals(bestDeals);
}

// Listen for notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
    const itemId = notificationId.split('-')[2]; // Extract item ID from notification ID
    if (itemId) {
        // Open the BAXUS listing in a new tab
        chrome.tabs.create({ url: `https://baxus.co/asset/${itemId}` });
    }
});

// --- Helper functions (normalizeBottleName, calculateSimilarity) ---
function normalizeBottleName(name) {
  if (!name) return '';
  
  // Define common irrelevant words to filter out
  const commonWords = [
    // Articles
    'the', 'a', 'an',
    // Prepositions
    'to', 'at', 'for', 'in', 'on', 'by', 'with', 'from', 'of', 'into', 'during', 'until', 'against', 'among', 'throughout', 'between', 'behind', 'beyond',
    // Conjunctions
    'and', 'or', 'but', 'nor', 'yet', 'so', 'although', 'because',
    // Common descriptors
    'limited', 'edition', 'release', 'single', 'barrel', 'cask', 'strength', 'proof', 'year', 'old', 'aged', 'distillery', 'winery', 'vineyard', 'chateau', 'domaine',
    // Common bottle/alcohol terms
    'bottle', 'bottled', 'distilled', 'spirits', 'wine', 'whiskey', 'whisky', 'bourbon', 'scotch', 'vodka', 'gin', 'rum', 'tequila',
    // Commerce terms
    'buy', 'shop', 'store', 'price', 'sale', 'discount', 'special', 'offer', 'available', 'new', 'pack', 'set',
    // Size/volume terms
    'ml', 'liter', 'litre', 'oz', 'ounce', 'cl', 'size',
    // Quality terms
    'premium', 'reserve', 'special', 'finest', 'best', 'quality', 'exclusive', 'signature', 'collection', 'series',
    // Other common terms
    'only', 'just', 'now', 'here', 'there', 'online', 'official', 'genuine', 'original'
  ];
  
  // Create a regex pattern from the common words
  const commonWordsPattern = new RegExp(`\\b(${commonWords.join('|')})\\b`, 'gi');
  
  return name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\b\d{2}\b/g, '') // Remove 2 digit numbers
    .replace(commonWordsPattern, '') // Remove common irrelevant words
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

// Helper: Get first 3 words from normalized name
function getFirst3Words(name) {
  const normalized = normalizeBottleName(name);
  return normalized.split(/\s+/).slice(0, 3).join(' ');
}

// Function to calculate similarity between two strings (Levenshtein distance based)
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null));
  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }
  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator, // substitution
      );
    }
  }
  const maxLength = Math.max(str1.length, str2.length);
  return maxLength > 0 ? 1 - track[str2.length][str1.length] / maxLength : (str1 === str2 ? 1 : 0);
}
// --- End of helper functions ---


// --- Search Function with Caching ---

const CACHE_EXPIRY_MINUTES = 30; // Cache API results for 30 minutes
const API_CACHE_EXPIRY_MINUTES = 360; // 6 hours

// Helper: Deduplicate by ID
function deduplicateListings(listings) {
  const seen = new Set();
  return listings.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// Helper: Sort by similarity (desc), then price (asc)
function sortByRelevance(list, originalName) {
  return list.sort((a, b) => {
    const simA = calculateSimilarity(originalName, a.name);
    const simB = calculateSimilarity(originalName, b.name);
    if (simA !== simB) return simB - simA;
    return a.price - b.price;
  });
}

// Helper function to get words from a bottle name
function getSignificantWords(name) {
  // First normalize and clean the name
  const normalizedName = normalizeBottleName(name);
  // Split into words and filter out empty strings
  return normalizedName.split(/\s+/).filter(Boolean);
}

// Helper function to check if two bottle names share at least one word
function hasCommonWord(name1, name2) {
  const words1 = getSignificantWords(name1);
  const words2 = getSignificantWords(name2);
  return words1.some(word => words2.includes(word));
}

// Helper function to count matching words between two names
function countMatchingWords(name1, name2) {
  const words1 = getSignificantWords(name1);
  const words2 = getSignificantWords(name2);
  return words1.filter(word => words2.includes(word)).length;
}

// Main search function (multi-query, dedup, cache, relevance)
async function searchBaxusListings(query, isManualSearch = false) {
  try {
    if (!query) return [];
    const normalizedQuery = normalizeBottleName(query);
    if (!normalizedQuery) return [];
    const words = normalizedQuery.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    
    // Build queries - we'll only use first word, first+second, first+third
    const firstWord = words[0];
    const q1 = firstWord; // First word only
    const q2 = words.length > 1 ? `${firstWord} ${words[1]}` : firstWord;
    const q3 = words.length > 2 ? `${firstWord} ${words[2]}` : firstWord;
    const queries = [q1, q2, q3];
    const originalName = normalizedQuery;
    
    // Async fetch with cache for each query
    const fetchOrCache = async (q, queryIndex) => {
      const cacheKey = `search6h_${q}`;
      const cached = await getCachedApiResponse(cacheKey);
      if (cached) {
        const cacheAge = (new Date() - new Date(cached.timestamp)) / (1000 * 60);
        if (cacheAge < API_CACHE_EXPIRY_MINUTES) {
          console.log(`[Honey Barrel BG] (CACHE) BAXUS API Query: ?from=0&size=20&listed=true&query=${encodeURIComponent(q)}`);
          return cached.data.map(item => ({
            ...item,
            foundByQuery: q,
            queryIndex: queryIndex
          }));
        }
      }
      
      try {
        const apiUrl = `${BAXUS_API_URL}?from=0&size=20&listed=true&query=${encodeURIComponent(q)}`;
        console.log(`[Honey Barrel BG] (LIVE) BAXUS API Query: ?from=0&size=20&listed=true&query=${encodeURIComponent(q)}`);
        
        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (!response.ok) {
          throw new Error(`API request failed (${response.status}): ${response.statusText}`);
        }
        
        const data = await response.json();
        let resultsArray = [];
        if (Array.isArray(data)) resultsArray = data;
        else if (data && data.hits && Array.isArray(data.hits.hits)) resultsArray = data.hits.hits;
        else if (data && Array.isArray(data.results)) resultsArray = data.results;
        else if (data && data.results) resultsArray = data.results;
        
        // Extract and validate listings
        const listings = resultsArray
          .map(item => {
            const source = item._source || item;
            return {
              id: source.id,
              price: parseFloat(source.price),
              name: source.name,
              imageUrl: source.imageUrl,
              spiritType: source.spiritType,
              blurhash: source.blurhash,
              region: source.attributes?.Region,
              foundByQuery: q,
              queryIndex: queryIndex,
              similarity: calculateSimilarity(originalName, source.name)
            };
          })
          .filter(item => item.id && typeof item.price === 'number' && !isNaN(item.price) && item.price > 0 && item.name);
        
        await saveApiResponseToCache(cacheKey, listings);
        return listings;
      } catch (err) {
        if (err instanceof TypeError && err.message === 'Failed to fetch') {
          throw new Error('Network error: Unable to connect to BAXUS. Please check your internet connection.');
        }
        if (cached) {
          console.log(`[Honey Barrel BG] Network error, using cached data for query "${q}"`);
          return cached.data.map(item => ({
            ...item,
            foundByQuery: q,
            queryIndex: queryIndex
          }));
        }
        throw err;
      }
    };
    
    // Run all queries in parallel with their indices
    const results = await Promise.all(queries.map((q, index) => fetchOrCache(q, index)));
    
    // Merge results
    let allListings = [].concat(...results);
    
    // Filter listings to only include those that share at least one word with original query
    allListings = allListings.filter(listing => hasCommonWord(originalName, listing.name));
    
    // Deduplicate keeping the first occurrence (which will be from the earliest query)
    const seen = new Set();
    allListings = allListings.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // Add query bottle name and matching words count to each listing
    allListings = allListings.map(item => ({
      ...item,
      queryBottleName: query,
      matchingWordsCount: countMatchingWords(getFirst3Words(normalizedQuery), normalizeBottleName(item.name))
    }));
    
    return allListings;
  } catch (error) {
    console.error('[Honey Barrel BG] Error in multi-query search:', error);
    throw new Error(error.message || 'Failed to search BAXUS marketplace. Please try again.');
  }
}

// Message handling with proper async support
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request.type === 'SEARCH_BOTTLE') {
        if (!request.bottleName) {
          console.log("[Honey Barrel BG] Received SEARCH_BOTTLE request with no bottleName.");
          sendResponse({ matches: [], query: null, error: "No bottle name provided" });
          return; // Exit async function
        }

        const matches = await searchBaxusListings(request.bottleName, request.isManualSearch);
        console.log(`[Honey Barrel BG] Sending back ${matches.length} matches for query "${request.bottleName}"`);

        // --- Gamification: Award points for finding match & update streak ---
        if (matches.length > 0) {
          // Only award points if not throttled (based on bottle name and time)
          const throttled = await isSearchPointsThrottled(request.bottleName);
          if (!throttled) {
            await addPoints(POINTS.FIND_MATCH, `Finding match for ${request.bottleName}`);
            // Record action for badge check
            await recordMatchFound();
            // Update streak on successful, non-throttled match finding
            const { updatedStreak } = await updateStreak();
            // Check streak badge specifically after updating streak
            await checkAndAwardBadges('streakUpdate', { currentStreak: updatedStreak });
          }
        }
        // --- End Gamification & Badge Logic ---

        sendResponse({ matches, query: request.bottleName });

      } else if (request.type === 'PRODUCT_VIEWED') {
        // --- Gamification & Badge Logic: Award points & check badges for viewing product page ---
        if (request.url) {
          const throttled = await isProductViewThrottled(request.url);
          if (!throttled) {
            await addPoints(POINTS.VIEW_PRODUCT, `Viewing product page: ${request.url}`);
            // Record action for badge check
            await recordProductView();
          }
        }
        // No response needed for this message type
        // --- End Gamification & Badge Logic ---

      } else if (request.type === 'WATCHLIST_ADD') {
        // --- Gamification & Badge Logic: Award points & check badges for adding to watchlist ---
        await addPoints(POINTS.ADD_WATCHLIST, 'Adding item to watchlist');
        // Record action for badge check
        await recordWatchlistAdd();
        // No response needed
        // --- End Gamification & Badge Logic ---

      } else if (request.type === 'DEAL_SHARED') {
        // --- Gamification & Badge Logic: Award points & check badges for sharing deal ---
        await addPoints(POINTS.SHARE_DEAL, 'Sharing deal');
        // Record action for badge check
        await recordDealShare();
        // No response needed
        // --- End Gamification & Badge Logic ---

      } else if (request.type === 'GET_USER_STATS') {
        // --- Gamification & Badge Logic: Send stats (including badges) to popup ---
        const stats = await getUserStats(); // getUserStats now includes earnedBadges
        sendResponse({
            ...stats,
            allBadges: BADGES // Send badge definitions as well
        });
        // --- End Gamification & Badge Logic ---
      }
      // Handle other message types if necessary
    } catch (error) {
      console.error('[Honey Barrel BG] Error processing message:', request.type, error);
      // Attempt to send an error response if possible
      if (request.type === 'SEARCH_BOTTLE') {
        sendResponse({ matches: [], error: error.message, query: request.bottleName });
      } else if (request.type === 'GET_USER_STATS') {
        sendResponse({ points: 0, streak: 0, earnedBadges: [], error: error.message });
      }
      // For other types, error is logged, no specific response sent
    }
      // --- Handle message to open popup ---
      if (request.type === 'OPEN_POPUP') {
          console.log("[Background] Received OPEN_POPUP message");
          // Check if chrome.action is available (it should be in Manifest V3 background)
          if (chrome.action && chrome.action.openPopup) {
              chrome.action.openPopup().catch(err => {
                  console.error("Error opening popup:", err);
              });
          } else {
              console.warn("chrome.action.openPopup is not available.");
          }
          // No response needed for opening popup
      }
      // --- End Handle message to open popup ---
  })(); // Immediately invoke the async function

  // Return true to indicate that the response will be sent asynchronously
  // This is crucial for all message types that might involve async operations.
  return true;
});

// Keep service worker active
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Honey Barrel BG] Extension installed/updated");
  
  // Initialize best deals storage
  await initializeBestDeals();
  
  // Create the alarm when the extension is first installed or updated
  chrome.alarms.create(WATCHLIST_CHECK_ALARM_NAME, {
    periodInMinutes: ALARM_PERIOD_MINUTES
  });
  console.log(`[Honey Barrel BG] Watchlist check alarm created to run every ${ALARM_PERIOD_MINUTES} minutes.`);
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[Honey Barrel BG] Browser started");
  // Optional: Ensure alarm exists on browser startup, as non-persistent alarms might be cleared
  chrome.alarms.get(WATCHLIST_CHECK_ALARM_NAME, (alarm) => {
    if (!alarm) {
      console.log("[Honey Barrel BG] Watchlist check alarm not found on startup, creating...");
      chrome.alarms.create(WATCHLIST_CHECK_ALARM_NAME, {
        periodInMinutes: ALARM_PERIOD_MINUTES
      });
    }
  });
  // Clear expired cache on startup
  clearExpiredCache(CACHE_EXPIRY_MINUTES).catch(err => {
    console.error("[Honey Barrel BG] Error clearing expired cache on startup:", err);
  });
});

// Listener for the alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === WATCHLIST_CHECK_ALARM_NAME) {
    console.log("[Honey Barrel BG] Received watchlist check alarm. Checking prices...");
    await checkWatchlistPrices();
  }
});

// Function to fetch exact listings from Baxus
async function fetchAllBaxusListings(page = 0, size = 20, query = '') {
    const from = page * size;
    // Use exact query without normalization
    const queryParam = query ? `&query=${encodeURIComponent(query)}` : '';
    const apiUrl = `${BAXUS_API_URL}?from=${from}&size=${size}&listed=true${queryParam}`;
    console.error(`[Honey Barrel BG] fetchAllBaxusListings() apiUrl :`, apiUrl);
    try {
        console.log(`[Honey Barrel BG] Fetching listings batch from URL: ${apiUrl}`);
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();
        let resultsArray = [];

        if (data?.hits?.hits) {
            resultsArray = data.hits.hits;
        } else if (Array.isArray(data)) {
            resultsArray = data;
        } else if (data?.results) {
            resultsArray = data.results;
        }

        // Extract and validate listings
        return resultsArray
            .map(item => {
                const source = item._source || item;
                return {
                    id: source.id,
                    price: parseFloat(source.price),
                    name: source.name,
                    imageUrl: source.imageUrl
                };
            })
            .filter(item => (
                item.id && 
                typeof item.price === 'number' && 
                !isNaN(item.price) && 
                item.price > 0 && 
                item.name
            ));

    } catch (error) {
        console.error(`[Honey Barrel BG] Error fetching listings:`, error);
        return [];
    }
}

// Updated function to check watchlist prices
async function checkWatchlistPrices(retryCount = 0) {
    try {
        const watchlistItems = await getWatchlistItems();
        if (!watchlistItems?.length) {
            console.log("[Honey Barrel BG] Watchlist is empty, skipping price check.");
            return;
        }

        console.log(`[Honey Barrel BG] Checking prices for ${watchlistItems.length} watchlist items.`);

        for (const watchedItem of watchlistItems) {
            try {
                const currentListings = await fetchAllBaxusListings(0, 1000, watchedItem.name);
                
                if (!currentListings?.length) {
                    console.log(`[Honey Barrel BG] No current listings found for "${watchedItem.name}"`);
                    continue;
                }

                // Find exact match and cheapest variant
                const exactListing = currentListings.find(l => l.id === watchedItem.id);
                const similarListings = currentListings.filter(l => 
                    l.name.toLowerCase().includes(watchedItem.name.toLowerCase()) ||
                    watchedItem.name.toLowerCase().includes(l.name.toLowerCase())
                );
                
                const cheapestListing = similarListings.reduce((min, curr) => 
                    curr.price < min.price ? curr : min, similarListings[0]
                );

                const lastSeenPrice = watchedItem.lastSeenPrice;
                const bestDeals = await getBestDeals();
                const currentBestDeal = bestDeals[watchedItem.id];
                
                // For exact matches, notify if price is lower than last seen
                if (exactListing?.price && lastSeenPrice && exactListing.price < lastSeenPrice) {
                    await notifyPriceDrop(watchedItem, exactListing, lastSeenPrice, 'exact');
                } 
                // For variants, only notify if price is lower than the best deal we've found
                else if (cheapestListing && cheapestListing.id !== watchedItem.id) {
                    const bestPrice = currentBestDeal?.price || exactListing?.price || lastSeenPrice;
                    if (cheapestListing.price < bestPrice) {
                        await notifyPriceDrop(watchedItem, cheapestListing, bestPrice, 'variant');
                    }
                }

            } catch (itemError) {
                console.error(`[Honey Barrel BG] Error checking "${watchedItem.name}":`, itemError);
            }
        }

    } catch (error) {
        console.error("[Honey Barrel BG] Error in checkWatchlistPrices:", error);
        if (retryCount < MAX_RETRIES) {
            console.log(`[Honey Barrel BG] Retrying (${retryCount + 1}/${MAX_RETRIES})...`);
            setTimeout(() => checkWatchlistPrices(retryCount + 1), RETRY_DELAY);
        }
    }
}

// Helper function to determine if price change is significant
function isPriceChangeSignificant(oldPrice, newPrice) {
    if (!oldPrice || !newPrice) return false;
    
    const absoluteChange = Math.abs(newPrice - oldPrice);
    const percentChange = (absoluteChange / oldPrice) * 100;
    
    return absoluteChange >= MIN_PRICE_CHANGE_ABSOLUTE || 
           percentChange >= MIN_PRICE_CHANGE_PERCENT;
}

// Helper function to handle price drop notifications with duplicate prevention
async function notifyPriceDrop(watchedItem, newListing, oldPrice, type) {
    // For exact matches, compare with the item's last seen price
    // For variants, compare with the best deal we've found so far
    const isNewBestDeal = await updateBestDealPrice(
        watchedItem.id,
        newListing.price,
        type === 'variant' ? newListing.id : null
    );

    // Only notify if this is a new best deal
    if (!isNewBestDeal) {
        console.log(`[Honey Barrel BG] Skipping notification - not a new best deal for ${watchedItem.name}`);
        return;
    }

    const notificationId = `price-drop-${newListing.id}-${Date.now()}`;
    const bestDeals = await getBestDeals();
    const previousBestPrice = type === 'exact' ? oldPrice : bestDeals[watchedItem.id]?.price;

    // Use retail price if available for the notification message
    const wasPrice = watchedItem.retailPrice || previousBestPrice;
    const savingsAmount = wasPrice ? (wasPrice - newListing.price) : 0;
    const savingsPercent = wasPrice ? ((savingsAmount / wasPrice) * 100) : 0;

    const message = wasPrice
        ? `${newListing.name} dropped to $${newListing.price.toFixed(2)} (was $${wasPrice.toFixed(2)})\nYou save $${savingsAmount.toFixed(2)} (${Math.abs(savingsPercent).toFixed(1)}%)`
        : (type === 'exact'
            ? `${newListing.name} dropped to $${newListing.price.toFixed(2)} (was $${oldPrice.toFixed(2)})`
            : `Found ${newListing.name} for $${newListing.price.toFixed(2)} (better than previous best of $${previousBestPrice?.toFixed(2)})`);

    chrome.notifications.create(notificationId, {
        type: "basic",
        iconUrl: newListing.imageUrl || "icons/icon128.png",
        title: "New Best Price Found!",
        message: message,
        priority: 2
    });

    // Save notification to history
    await saveNotification({
        type: "price_drop",
        bottleId: newListing.id,
        bottleName: newListing.name,
        oldPrice: previousBestPrice,
        newPrice: newListing.price,
        imageUrl: newListing.imageUrl,
        timestamp: new Date(),
        url: `https://baxus.co/asset/${newListing.id}`,
        retailPrice: watchedItem.retailPrice // Add this line
    });

    // Only update lastSeenPrice if it's the exact same item
    if (type === 'exact') {
        watchedItem.lastSeenPrice = newListing.price;
        await saveToWatchlist(watchedItem);
    }
}

// Exchange Rate API URL (Example using a free API - replace if needed)
const EXCHANGE_RATE_API_URL = "https://api.exchangerate-api.com/v4/latest/USD";
const EXCHANGE_RATE_CACHE_KEY = "honeyBarrelExchangeRates";
const EXCHANGE_RATE_CACHE_EXPIRY_HOURS = 6; // Cache rates for 6 hours

// Function to get exchange rates (from cache or API)
async function getExchangeRates() {
  try {
    // Try getting from chrome.storage.local first
    const cachedData = await chrome.storage.local.get(EXCHANGE_RATE_CACHE_KEY);
    if (cachedData[EXCHANGE_RATE_CACHE_KEY]) {
      const { timestamp, rates } = cachedData[EXCHANGE_RATE_CACHE_KEY];
      const now = Date.now();
      if (now - timestamp < EXCHANGE_RATE_CACHE_EXPIRY_HOURS * 60 * 60 * 1000) {
        console.log("[Honey Barrel BG] Using cached exchange rates.");
        return rates;
      }
    }

    // Fetch from API if cache is old or doesn't exist
    console.log("[Honey Barrel BG] Fetching fresh exchange rates...");
    const response = await fetch(EXCHANGE_RATE_API_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (!data || !data.rates) {
      throw new Error("Invalid API response format");
    }

    // Save to cache with timestamp
    const ratesToCache = { 
      timestamp: Date.now(), 
      rates: data.rates 
    };
    await chrome.storage.local.set({ [EXCHANGE_RATE_CACHE_KEY]: ratesToCache });
    console.log("[Honey Barrel BG] Fetched and cached new exchange rates.");
    return data.rates;

  } catch (error) {
    console.error("[Honey Barrel BG] Error fetching or caching exchange rates:", error);
    // Return null or default rates if fetching fails
    return null; 
  }
}

// --- End Exchange Rate Logic ---

// Keep service worker active

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'searchSimilarBottles') {
    // Use existing BAXUS_API_URL to search for similar bottles
    fetch(`${BAXUS_API_URL}?q=${encodeURIComponent(message.bottleName)}`)
      .then(response => response.json())
      .then(data => {
        // Send results back to content script
        sendResponse({ results: data.results || [] });
      })
      .catch(error => {
        console.error('Error searching similar bottles:', error);
        sendResponse({ results: [] });
      });
    return true; // Will respond asynchronously
  }
  
  if (message.action === 'openPopup') {
    chrome.action.openPopup();
    return true;
  }
});

// Create context menu item on install
chrome.runtime.onInstalled.addListener(async () => {
  console.log("[Honey Barrel BG] Extension installed/updated");
  
  // Create context menu item
  chrome.contextMenus.create({
    id: "searchBaxus",
    title: "Search Baxus for \"%s\"",
    contexts: ["selection"]
  });

  // Initialize best deals storage
  await initializeBestDeals();
  
  // Create the alarm when the extension is first installed or updated
  chrome.alarms.create(WATCHLIST_CHECK_ALARM_NAME, {
    periodInMinutes: ALARM_PERIOD_MINUTES
  });
  console.log(`[Honey Barrel BG] Watchlist check alarm created to run every ${ALARM_PERIOD_MINUTES} minutes.`);
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "searchBaxus" && info.selectionText) {
    // Store the search text and open popup
    chrome.storage.local.set({ 
      "pendingSearch": info.selectionText 
    }, () => {
      chrome.action.openPopup();
    });
  }
});

// Keep service worker active
// ...existing code...
