// Popup script for Honey Barrel extension
import { openDB, saveToWatchlist, removeFromWatchlist, getWatchlistItems, getWatchlistItemById, saveNotification, getNotifications } from './db.js';
// Import BADGES constant for progress display
import { BADGES } from './gamification.js';

// Global variables to store last search results for currency re-rendering
let lastMatches = [];
let lastCurrentPrice = 0;

// Helper function to format price values
function formatPrice(price, currency = 'USD') {
  if (typeof price !== 'number') return 'N/A';
  if (currency && currency !== 'USD') {
    return `${price.toFixed(2)} ${currency}`;
  }
  return `$${price.toFixed(2)}`;
}

// Function to normalize bottle name and get first 3 words
function normalizeBottleName(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[^a-z0-9.\s]/g, '') // Remove special characters except period
    .replace(/\b\d{2}\b/g, '') // Remove 2 digit numbers
    .replace(/\b(the|limited|edition|release|single|barrel|cask|strength|proof|year|old|aged|distillery|winery|vineyard|chateau|domaine)\b/g, '') // Remove common terms
    .replace(/\s+/g, ' ') // Normalize spaces
    .trim();
}

// Helper function to get first 3 words of a string
function getFirstThreeWords(str) {
  return str.split(/\s+/).slice(0, 3).join(' ');
}

// Helper function to count matching words between two strings
function countMatchingWords(str1, str2) {
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));
  let count = 0;
  for (const word of words1) {
    if (words2.has(word)) count++;
  }
  return count;
}

// Helper: Get and set read notification IDs in localStorage
function getReadNotificationIds() {
  try {
    return JSON.parse(localStorage.getItem('readNotificationIds') || '[]');
  } catch {
    return [];
  }
}
function setReadNotificationIds(ids) {
  localStorage.setItem('readNotificationIds', JSON.stringify(ids));
}

// Helper: Update notifications badge
async function updateNotificationsBadge() {
  const notifications = await getNotifications(50);
  const readIds = getReadNotificationIds();
  const unreadCount = notifications.filter(n => n.id && !readIds.includes(n.id)).length;
  // Target the correct badge ID
  const badge = document.getElementById('activity-badge');
  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      // Use inline-block to show the badge next to the text
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

// Mark all notifications as read
async function markAllNotificationsRead() {
  const notifications = await getNotifications(50);
  const ids = notifications.map(n => n.id).filter(Boolean);
  setReadNotificationIds(ids);
  updateNotificationsBadge();
}

// Function to create a match item element with enhanced details
function createMatchItem(match, currentPrice, originalPrice, originalCurrency) {
  const matchItem = document.createElement("div");
  matchItem.className = "match-item";

  // Main content container
  const contentDiv = document.createElement("div");
  contentDiv.className = "match-item-content match-content";
  matchItem.appendChild(contentDiv);

  // Header div for image, details, and save button
  const headerDiv = document.createElement("div");
  headerDiv.className = "match-header";
  contentDiv.appendChild(headerDiv);

  // Image
  const img = document.createElement("img");
  img.src = match.imageUrl || "images/bottle-placeholder.png";
  img.alt = match.name;
  img.className = "match-image";
  img.onerror = () => { img.src = "images/bottle-placeholder.png"; };
  headerDiv.appendChild(img);

  // Details container
  const detailsDiv = document.createElement("div");
  detailsDiv.className = "match-details";
  headerDiv.appendChild(detailsDiv);

  // Bottle Name
  const nameDiv = document.createElement("div");
  nameDiv.className = "match-name";
  nameDiv.textContent = match.name;
  detailsDiv.appendChild(nameDiv);

  // Price Comparison
  const priceCompareDiv = document.createElement("div");
  priceCompareDiv.className = "price-compare";
  const baxusPrice = match.price;

  // Handle case where retail price couldn't be extracted
  const noRetailPrice = !currentPrice || currentPrice <= 0;
  const priceDiff = noRetailPrice ? 0 : currentPrice - baxusPrice;
  const savingsPercent = noRetailPrice ? 0 : Math.round((priceDiff / currentPrice) * 100);

  let savingsText = "";
  let savingsClass = "neutral";

  if (noRetailPrice) {
    savingsText = "Price comparison unavailable";
    savingsClass = "neutral";
  } else if (priceDiff > 0) {
    savingsText = `Save $${priceDiff.toFixed(2)} (${savingsPercent}%)`;
    savingsClass = "positive";
  } else if (priceDiff < 0) {
    savingsText = `$${Math.abs(priceDiff).toFixed(2)} more`;
    savingsClass = "negative";
  } else {
    savingsText = "Same price";
    savingsClass = "neutral";
  }

  // Build the price comparison section
  let priceComparisonHtml = '';

  if (noRetailPrice) {
    priceComparisonHtml = `
            <div class="retail-price" style="font-size:12px;color:var(--text-secondary-color);margin-top:2px;">
                <span style="color: var(--text-warning-color);">⚠️ Could not detect price from current page</span>
            </div>`;
  } else if (originalPrice && originalCurrency) {
    if (originalCurrency !== 'USD') {
      priceComparisonHtml = `
                <div class="retail-price" style="font-size:12px;color:var(--text-secondary-color);margin-top:2px;">
                    Current Page Price: ${formatPrice(originalPrice, originalCurrency)}<br>
                    Converted: $${currentPrice.toFixed(2)} USD
                </div>`;
    } else {
      priceComparisonHtml = `
                <div class="retail-price" style="font-size:12px;color:var(--text-secondary-color);margin-top:2px;">
                    Current Page Price: ${formatPrice(originalPrice, 'USD')}
                </div>`;
    }
  }

  priceCompareDiv.innerHTML = `
        <div class="price-details" style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;">
            ${priceComparisonHtml}
            <div class="baxus-notice" style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:12px;color:var(--text-secondary-color); display:inline-flex; align-items:center; gap:4px;">Found in <img src="icons/Baxus_Full_Logo_Green.svg" style="height:10px;" />:</span>
                <span style="font-weight:600;font-size:14px;">${formatPrice(baxusPrice)}</span>
            </div>
            <div class="savings-section">
                <span class="savings ${savingsClass}" style="display:inline-block;padding:4px 8px;border-radius:4px;font-size:13px;">${savingsText}</span>
            </div>
        </div>
    `;
  detailsDiv.appendChild(priceCompareDiv);

  // Add Save to Watchlist button
  const saveBtn = document.createElement("button");
  saveBtn.className = "save-btn";
  saveBtn.setAttribute("aria-label", `Save ${match.name} to watchlist`);
  saveBtn.setAttribute("data-bottle-id", match.id);
  saveBtn.setAttribute("data-bottle-name", match.name);
  saveBtn.setAttribute("data-bottle-price", match.price);
  saveBtn.setAttribute("data-bottle-image", match.imageUrl || "");
  saveBtn.setAttribute("data-retail-price", currentPrice); // Add retail price attribute
  saveBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.04 3 5.5l7 7Z"></path>
        </svg>
    `;
  headerDiv.appendChild(saveBtn);

  // View on BAXUS Button - Must be added before share section
  const viewBtn = document.createElement("a");
  viewBtn.href = `https://baxus.co/asset/${match.id}`;
  viewBtn.target = "_blank";
  viewBtn.className = "view-btn";
  viewBtn.innerHTML = `
        View on BAXUS
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12h14"></path>
            <path d="m12 5 7 7-7 7"></path>
        </svg>
    `;
  contentDiv.appendChild(viewBtn);

  // Share Section
  const shareSection = document.createElement("div");
  shareSection.className = "share-section";
  contentDiv.appendChild(shareSection);

  const shareLabel = document.createElement("span");
  shareLabel.className = "share-label";
  shareLabel.textContent = "Share this deal:";
  shareSection.appendChild(shareLabel);

  // Twitter Button
  const twitterBtn = document.createElement("button");
  twitterBtn.className = "share-btn twitter-share";
  twitterBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path>
        </svg>
        Twitter
    `;
  twitterBtn.setAttribute("data-bottle-name", match.name);
  twitterBtn.setAttribute("data-baxus-price", baxusPrice.toFixed(2));
  twitterBtn.setAttribute("data-savings", savingsText);
  twitterBtn.setAttribute("data-url", `https://baxus.co/asset/${match.id}`);
  shareSection.appendChild(twitterBtn);

  // Discord Button
  const discordBtn = document.createElement("button");
  discordBtn.className = "share-btn discord-share";
  discordBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M21.539 2.987a1.6 1.6 0 0 0-1.8-.5L17.05 3.4a1.6 1.6 0 0 0-1.1.4L13.7 6.1a1.6 1.6 0 0 0-.4 1.1l-.3 2.4a1.6 1.6 0 0 0 .6 1.4l1.8 1.8a1.6 1.6 0 0 0 1.4.6l2.4-.3a1.6 1.6 0 0 0 1.1-.4l2.3-2.3a1.6 1.6 0 0 0 .4-1.1l.9-2.7a1.6 1.6 0 0 0-.5-1.8Z"></path>
        </svg>
        Discord
    `;
  discordBtn.setAttribute("data-bottle-name", match.name);
  discordBtn.setAttribute("data-baxus-price", baxusPrice.toFixed(2));
  discordBtn.setAttribute("data-savings", savingsText);
  discordBtn.setAttribute("data-url", `https://baxus.co/asset/${match.id}`);
  shareSection.appendChild(discordBtn);

  // Add event listeners after elements are in the DOM
  twitterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const bottleName = e.currentTarget.getAttribute("data-bottle-name");
    const baxusPrice = e.currentTarget.getAttribute("data-baxus-price");
    const savings = e.currentTarget.getAttribute("data-savings");
    const url = e.currentTarget.getAttribute("data-url");
    const text = `Found a deal on ${bottleName} at BAXUS for $${baxusPrice}! (${savings}). Check it out:`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}&hashtags=Baxus,WhiskeyDeals`;
    window.open(twitterUrl, "_blank");
    // --- Gamification: Send DEAL_SHARED message ---
    chrome.runtime.sendMessage({ type: 'DEAL_SHARED' }).catch(err => console.warn("Error sending DEAL_SHARED message:", err));
    // --- End Gamification ---
  });

  discordBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    const bottleName = e.currentTarget.getAttribute("data-bottle-name");
    const baxusPrice = e.currentTarget.getAttribute("data-baxus-price");
    const savings = e.currentTarget.getAttribute("data-savings");
    const url = e.currentTarget.getAttribute("data-url");
    const text = `Found a deal on ${bottleName} at BAXUS for $${baxusPrice}! (${savings}). Check it out: ${url}`;
    navigator.clipboard.writeText(text).then(() => {
      alert("Deal info copied to clipboard for Discord!");
      // --- Gamification: Send DEAL_SHARED message ---
      chrome.runtime.sendMessage({ type: 'DEAL_SHARED' }).catch(err => console.warn("Error sending DEAL_SHARED message:", err));
      // --- End Gamification ---
    }).catch(err => {
      console.error("Failed to copy text for Discord:", err);
      alert("Could not copy deal info. Please copy manually.");
    });
  });

  // Add save button event listener
  saveBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    event.preventDefault();
    const button = event.currentTarget;
    const bottleId = button.getAttribute("data-bottle-id");
    const isSaved = button.classList.contains("saved");

    if (isSaved) {
      try {
        await removeFromWatchlist(bottleId);
        button.classList.remove("saved");
        button.setAttribute("aria-label", `Save ${match.name} to watchlist`);
        button.querySelector("svg path").setAttribute("fill", "none");
        console.log(`Removed ${bottleId} from watchlist`);
      } catch (error) {
        console.error("Failed to remove from watchlist:", error);
      }
    } else {
      const bottleData = {
        id: bottleId,
        name: button.getAttribute("data-bottle-name"),
        price: parseFloat(button.getAttribute("data-bottle-price")),
        retailPrice: parseFloat(button.getAttribute("data-retail-price")), // Save retail price
        imageUrl: button.getAttribute("data-bottle-image"),
        url: `https://baxus.co/asset/${bottleId}`,
        lastSeenPrice: parseFloat(button.getAttribute("data-bottle-price"))
      };
      try {
        await saveToWatchlist(bottleData);
        button.classList.add("saved");
        button.setAttribute("aria-label", `Remove ${match.name} from watchlist`);
        button.querySelector("svg path").setAttribute("fill", "currentColor");
        console.log(`Saved ${bottleId} to watchlist`);
        // --- Gamification: Send WATCHLIST_ADD message ---
        chrome.runtime.sendMessage({ type: 'WATCHLIST_ADD' }).catch(err => console.warn("Error sending WATCHLIST_ADD message:", err));
        // --- End Gamification ---
      } catch (error) {
        console.error("Failed to save to watchlist:", error);
      }
    }
    if (document.getElementById("watchlist-tab")?.classList.contains("active")) {
      displayWatchlist();
    }
  });

  // Check if item is already saved and update button style
  getWatchlistItemById(match.id).then(existingItem => {
    if (existingItem) {
      saveBtn.classList.add("saved");
      saveBtn.setAttribute("aria-label", `Remove ${match.name} from watchlist`);
      saveBtn.querySelector("svg path").setAttribute("fill", "currentColor");
    }
  });

  return matchItem;
}

// Function to show "no matches" content
function showNoMatches(isNetworkError = false) {
  const matchesContainer = document.querySelector(".matches");
  matchesContainer.innerHTML = isNetworkError ?
    `<div class="no-matches">
       <p>Unable to search BAXUS marketplace.</p>
       <p style="font-size: 12px; color: var(--text-secondary-color);">Please check your internet connection and try again.</p>
     </div>` :
    `<div class="no-matches">
       <p>No matches found on BAXUS for this bottle.</p>
       <p style="font-size: 12px; color: var(--text-secondary-color);">Try searching manually or check back later.</p>
     </div>`;
}

function hideLoadingElements(animate = true) {
  const loadingContainer = document.querySelector('.loading-container');
  if (animate) {
    loadingContainer.classList.add('hidden');
    setTimeout(() => {
      loadingContainer.style.display = 'none';
    }, 300); // Match transition duration
  } else {
    loadingContainer.style.display = 'none';
  }
}

// Function to update the status message and loading bar
function updateStatus(message, type = "info") { // types: info, loading, success, error
  const statusDiv = document.querySelector(".status");
  const loadingContainer = document.querySelector(".loading-container");
  const successCheckmark = document.querySelector(".success-checkmark");

  if (!statusDiv || !loadingContainer || !successCheckmark) {
    console.warn('Some status elements not found in the DOM');
    return;
  }

  // Clear any existing retry button
  const existingRetryBtn = statusDiv.querySelector('.retry-button');
  if (existingRetryBtn) {
    existingRetryBtn.remove();
  }

  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;

  if (type === "loading") {
    loadingContainer.style.display = "block";
    loadingContainer.classList.remove('hidden');
    successCheckmark.style.display = "none";
  } else {
    hideLoadingElements();
    if (type === "success") {
      successCheckmark.style.display = "block";
      const path = successCheckmark.querySelector("path");
      if (path) {
        path.style.strokeDashoffset = 0;
      }
      setTimeout(() => {
        successCheckmark.style.display = "none";
      }, 1500);
    } else if (type === "error") {
      successCheckmark.style.display = "none";
      // Add retry button for network errors
      const retryBtn = document.createElement('button');
      retryBtn.className = 'retry-button';
      retryBtn.textContent = 'Retry';
      retryBtn.addEventListener('click', async () => {
        // Get active tab and retry the search
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs[0];
          if (!activeTab || !activeTab.id) return;

          updateStatus("Retrying search...", "loading");
          chrome.tabs.sendMessage(activeTab.id, { type: "GET_BOTTLE_INFO" }, (response) => {
            if (chrome.runtime.lastError) {
              handleError("Could not connect to the page. Please refresh and try again.");
              return;
            }

            if (response && response.bottleInfo) {
              chrome.runtime.sendMessage(
                { type: "SEARCH_BOTTLE", bottleName: response.bottleInfo.bottleName },
                (searchResponse) => {
                  if (chrome.runtime.lastError || (searchResponse && searchResponse.error)) {
                    handleError(searchResponse?.error || "Network error occurred");
                    return;
                  }
                  if (searchResponse && searchResponse.matches) {
                    updateStatus("Similiar matches found!", "success");
                    displayMatches(searchResponse.matches, response.bottleInfo.price);
                  } else {
                    handleError("No matches found");
                    showNoMatches();
                  }
                }
              );
            }
          });
        });
      });
      statusDiv.appendChild(retryBtn);
    }
  }
}

// Function to handle errors
function handleError(message) {
  updateStatus(message || 'An error occurred', 'error');
  hideLoadingElements();
  const isNetworkError = message?.toLowerCase().includes('network') ||
                        message?.toLowerCase().includes('connection') ||
                        message?.toLowerCase().includes('failed');
  showNoMatches(isNetworkError);
  // Reset streak if error occurs during initial load/search
  // displayStreak(updateStreak(null)); // This line seems incorrect, updateStreak needs an ID
}

// Function to display matches in the popup
function displayMatches(matches, currentPrice, originalPrice = null, originalCurrency = null) {
  const matchesContainer = document.querySelector(".matches");
  matchesContainer.innerHTML = ""; // Clear previous matches

  const statusDiv = document.querySelector(".status");
  const statusCircle = document.querySelector(".status-circle");

  if (!matches || matches.length === 0) {
    if (statusDiv) statusDiv.textContent = "No Similar matches found!";
    if (statusCircle) statusCircle.style.background = "#e74c3c"; // red
    showNoMatches();
    return;
  } else {
    if (statusDiv) statusDiv.textContent = `Found ${matches.length} similar ${matches.length === 1 ? 'match' : 'matches'}!`;
    if (statusCircle) statusCircle.style.background = "#1abc9c"; // green/teal
  }

  // Add total matches count at the top
  const totalMatchesDiv = document.createElement("div");
  totalMatchesDiv.className = "total-matches-count";
  totalMatchesDiv.innerHTML = `
    <div style="text-align: left; padding: 8px 16px; color: var(--text-secondary-color); font-size: 14px;">
      Found ${matches.length} similar ${matches.length === 1 ? 'bottle' : 'bottles'}
    </div>
  `;
  matchesContainer.appendChild(totalMatchesDiv);

  // Get the first three words of the query bottle name
  const queryBottle = matches[0]?.queryBottleName || '';
  const normalizedQueryBottle = normalizeBottleName(queryBottle);
  const shortQueryBottle = getFirstThreeWords(normalizedQueryBottle);
  const firstWord = shortQueryBottle.split(' ')[0];
  const shortQueryWords = shortQueryBottle.split(' ').filter(Boolean);

  // Helper to get matching words and their total length
  function getMatchingWordsInfo(str1, str2) {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    let matches = [];
    for (const word of words1) {
      if (words2.has(word)) matches.push(word);
    }
    return {
      count: matches.length,
      totalChars: matches.reduce((acc, w) => acc + w.length, 0),
      matches
    };
  }

  const enhancedMatches = matches.map(match => {
    const normalizedName = normalizeBottleName(match.name);
    const matchingInfo = getMatchingWordsInfo(shortQueryBottle, normalizedName);
    return {
      ...match,
      normalizedName,
      matchingWordsCount: matchingInfo.count,
      matchingWordsChars: matchingInfo.totalChars,
      isFirstWordMatch: match.foundByQuery === firstWord
    };
  });

  // Custom sort
  const sortedMatches = enhancedMatches.sort((a, b) => {
    // 1. First: Results from first word query with 3 matching words (top), then 2+ matching words, sorted by total chars
    if (a.isFirstWordMatch && b.isFirstWordMatch) {
      if (a.matchingWordsCount === 3 && b.matchingWordsCount !== 3) return -1;
      if (a.matchingWordsCount !== 3 && b.matchingWordsCount === 3) return 1;
      if (a.matchingWordsCount >= 2 && b.matchingWordsCount >= 2) {
        if (a.matchingWordsCount !== b.matchingWordsCount) return b.matchingWordsCount - a.matchingWordsCount;
        if (a.matchingWordsChars !== b.matchingWordsChars) return b.matchingWordsChars - a.matchingWordsChars;
      }
      if (a.matchingWordsCount >= 2) return -1;
      if (b.matchingWordsCount >= 2) return 1;
    }
    // 2. Second: Other results from first word query
    if (a.isFirstWordMatch && !b.isFirstWordMatch) return -1;
    if (!a.isFirstWordMatch && b.isFirstWordMatch) return 1;
    // 3. Third: Results with most matching words in the shortened name
    if (a.matchingWordsCount !== b.matchingWordsCount) return b.matchingWordsCount - a.matchingWordsCount;
    // 4. Fourth: The rest, by price difference
    const priceDiffA = currentPrice - a.price;
    const priceDiffB = currentPrice - b.price;
    return priceDiffB - priceDiffA;
  });

  // Store results for potential re-rendering
  lastMatches = sortedMatches;
  lastCurrentPrice = currentPrice;

  // Display sorted matches with staggered animation
  sortedMatches.forEach((match, index) => {
    setTimeout(() => {
      matchesContainer.appendChild(createMatchItem(match, currentPrice, originalPrice, originalCurrency));
    }, index * 100);
  });

  // Update and Display Streak - This seems misplaced, streak logic is complex and likely handled elsewhere
  // const topMatchId = sortedMatches[0]?.id;
  // const currentStreak = updateStreak(topMatchId); // updateStreak is not defined here
  // displayStreak(currentStreak);
}

// Function to display watchlist items
async function displayWatchlist() {
  const watchlistContainer = document.getElementById("watchlist-items");
  const noItemsMessage = document.getElementById("no-watchlist-items");
  if (!watchlistContainer || !noItemsMessage) return;

  try {
    const items = await getWatchlistItems();
    watchlistContainer.innerHTML = ""; // Clear previous items

    if (items.length === 0) {
      noItemsMessage.style.display = "block";
    } else {
      noItemsMessage.style.display = "none";
      items.forEach(item => {
        const watchlistItem = document.createElement("div");
        watchlistItem.className = "watchlist-item";

        // Create anchor element to wrap the content
        const link = document.createElement("a");
        link.href = `https://baxus.co/asset/${item.id}`;
        link.target = "_blank";
        link.className = "watchlist-item-link";

        const priceDiff = item.retailPrice - item.lastSeenPrice;
        const percentDiff = ((priceDiff) / item.retailPrice * 100).toFixed(1);

        link.innerHTML = `
          <img src="${item.imageUrl || 'images/bottle-placeholder.png'}" alt="${item.name}" class="watchlist-item-image" onerror="this.onerror=null; this.src='images/bottle-placeholder.png';">
          <div class="watchlist-item-details">
            <div class="watchlist-item-name">${item.name}</div>
            <div class="watchlist-item-price">
              Found on <img src="icons/Baxus_Full_Logo_Green.svg" style="height: 10px;" />: $${item.lastSeenPrice?.toFixed(2)}
              <br>
            </div>
          </div>
        `;

        watchlistItem.appendChild(link);

        // Add remove button (outside the link)
        const removeBtn = document.createElement("button");
        removeBtn.className = "watchlist-remove-btn";
        removeBtn.setAttribute("data-bottle-id", item.id);
        removeBtn.setAttribute("aria-label", `Remove ${item.name} from watchlist`);
        removeBtn.textContent = "×";
        watchlistItem.appendChild(removeBtn);

        // Add event listener for remove button
        removeBtn.addEventListener("click", async (event) => {
          event.stopPropagation();
          const bottleId = event.currentTarget.getAttribute("data-bottle-id");
          try {
            await removeFromWatchlist(bottleId);
            console.log(`Removed ${bottleId} from watchlist via watchlist tab.`);
            displayWatchlist(); // Refresh the list
            // Also update save button state if the corresponding match item is visible
            const saveBtnOnMatchCard = document.querySelector(`.save-btn[data-bottle-id="${bottleId}"]`);
            if (saveBtnOnMatchCard) {
              saveBtnOnMatchCard.classList.remove("saved");
              saveBtnOnMatchCard.querySelector("svg path")?.setAttribute("fill", "none");
              saveBtnOnMatchCard.setAttribute("aria-label", `Save ${item.name} to watchlist`);
            }
          } catch (error) {
            console.error("Failed to remove from watchlist:", error);
          }
        });

        watchlistContainer.appendChild(watchlistItem);
      });
    }
  } catch (error) {
    console.error("Error displaying watchlist:", error);
    watchlistContainer.innerHTML = "<p style='color: var(--red);'>Error loading watchlist.</p>";
    noItemsMessage.style.display = "none";
  }
}

// Function to calculate percentage difference
function calculatePriceDifference(oldPrice, newPrice) {
  if (!oldPrice || !newPrice) return 0;
  return ((oldPrice - newPrice) / oldPrice) * 100;
}

// Function to display notifications in the Activity tab
async function displayNotifications() {
  const notificationsContainer = document.querySelector("#notifications-tab .notifications-list");
  const noNotificationsMessage = document.querySelector("#notifications-tab .no-notifications");
  if (!notificationsContainer || !noNotificationsMessage) return;

  try {
    const notifications = await getNotifications(50); // Get latest 50 notifications
    const readIds = getReadNotificationIds();
    notificationsContainer.innerHTML = ""; // Clear previous items

    if (notifications.length === 0) {
      noNotificationsMessage.style.display = "block";
    } else {
      noNotificationsMessage.style.display = "none";
      notifications.forEach(notif => {
        const notificationItem = document.createElement("div");
        notificationItem.className = "notification-item" + (notif.id && !readIds.includes(notif.id) ? " unread" : "");
        if (notif.url) {
          notificationItem.style.cursor = "pointer";
          notificationItem.addEventListener("click", () => {
            chrome.tabs.create({ url: notif.url });
          });
        }

        let iconHtml = "";
        let textHtml = "";

        // Customize based on notification type
        if (notif.type === "price_drop") {
          iconHtml = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                        </svg>`;

          // Use retailPrice if available, otherwise fallback to oldPrice
          const wasPrice = notif.retailPrice || notif.oldPrice;
          const savingsAmount = wasPrice - notif.newPrice;
          const savingsPercent = wasPrice ? ((savingsAmount / wasPrice) * 100) : 0;

          textHtml = `
                        <strong>${notif.bottleName}</strong>
                        <div style="margin-top: 4px;">
                            <span class="price-old">$${wasPrice?.toFixed(2)}</span>
                            →
                            <span class="price-new">$${notif.newPrice?.toFixed(2)}</span>
                            <span class="price-savings">
                                You save $${savingsAmount.toFixed(2)}
                                <span class="savings-percent">-${Math.abs(savingsPercent).toFixed(1)}%</span>
                            </span>
                        </div>`;
        } else {
          // Default/fallback notification style
          iconHtml = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                            <line x1="12" y1="7" x2="12" y2="13"/>
                            <line x1="15" y1="10" x2="9" y2="10"/>
                        </svg>`;
          textHtml = notif.message || "New activity";
        }

        // Calculate relative time
        const timeAgo = formatTimeAgo(notif.timestamp);

        notificationItem.innerHTML = `
                    <div class="notification-icon">${iconHtml}</div>
                    <div class="notification-text">${textHtml}</div>
                    <div class="notification-timestamp">${timeAgo}</div>
                `;
        notificationsContainer.appendChild(notificationItem);
      });
    }
    updateNotificationsBadge();
  } catch (error) {
    console.error("Error displaying notifications:", error);
    notificationsContainer.innerHTML = "<p style='color: var(--red);'>Error loading activity.</p>";
    noNotificationsMessage.style.display = "none";
  }
}

// Helper function to format time difference
function formatTimeAgo(timestamp) {
  if (!timestamp) return "";
  const now = new Date();
  const past = new Date(timestamp);
  const diffInSeconds = Math.floor((now - past) / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  return `${diffInDays}d ago`;
}

// --- Gamification: Streak Logic (Simplified - Full logic in background) ---
function displayStreak(streak) {
  const streakCounterElement = document.querySelector(".streak-counter"); // Header streak
  const streakCountSpan = document.getElementById("streak-count");
  const profileStreakCountSpan = document.getElementById("profile-streak-count"); // Profile tab streak

  const displayValue = streak > 0 ? streak : 0;

  if (streakCounterElement && streakCountSpan) {
    if (streak > 0) {
      streakCountSpan.textContent = displayValue;
      streakCounterElement.style.display = "block";
    } else {
      streakCounterElement.style.display = "none";
    }
  }
  // Also update the profile tab
  if (profileStreakCountSpan) {
    profileStreakCountSpan.textContent = displayValue;
  }
}

// Function to reset search and return to webpage bottle search
function cancelManualSearch() {
  const searchInput = document.getElementById("manual-search-input");
  const cancelButton = document.getElementById("cancel-search-button");

  // Clear the search input
  searchInput.value = "";

  // Hide cancel button
  cancelButton.classList.remove("visible");

  // Get active tab and re-trigger bottle search
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab || !activeTab.id) return;

    updateStatus("Searching for bottle matches...", "loading");
    chrome.tabs.sendMessage(activeTab.id, { type: "GET_BOTTLE_INFO" }, (response) => {
      if (chrome.runtime.lastError) {
        handleError("Could not connect to the page. Please refresh and try again.");
        return;
      }

      if (response && response.bottleInfo) {
        chrome.runtime.sendMessage(
          { type: "SEARCH_BOTTLE", bottleName: response.bottleInfo.bottleName },
          (searchResponse) => {
            if (chrome.runtime.lastError || (searchResponse && searchResponse.error)) {
              handleError(searchResponse?.error || "Network error occurred");
              return;
            }
            if (searchResponse && searchResponse.matches) {
              updateStatus("Similiar matches found!", "success");
              displayMatches(searchResponse.matches, response.bottleInfo.price);
            } else {
              handleError("No matches found");
              showNoMatches();
            }
          }
        );
      } else {
        handleError("Could not extract bottle info from this page.");
      }
    });
  });
}

// --- Manual Search Logic ---
async function performManualSearch() {
  const searchInput = document.getElementById("manual-search-input");
  const searchTerm = searchInput.value.trim();
  const cancelButton = document.getElementById("cancel-search-button");

  if (!searchTerm) {
    updateStatus("Please enter a bottle name to search.", "info");
    return;
  }

  // Show cancel button and loading state
  cancelButton.classList.add("visible");
  updateStatus("Searching BAXUS marketplace...", "loading");

  // Try to get price from current page, but don't prompt if we can't find it
  let retailPrice = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_BOTTLE_INFO" });
      if (response?.bottleInfo?.price) {
        retailPrice = response.bottleInfo.convertedUsdPrice || response.bottleInfo.price;
      }
    }
  } catch (error) {
    console.log("Could not extract price from page:", error);
  }

  try {
    const response = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "SEARCH_BOTTLE",
          bottleName: searchTerm,
          isManualSearch: true
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        }
      );
    });

    if (response && response.error) {
      handleError(response.error);
    } else if (response && response.matches) {
      updateStatus("Matches found!", "success");
      displayMatches(response.matches, retailPrice || null);
    } else {
      handleError("No matches found");
      showNoMatches();
    }
  } catch (error) {
    handleError("Network error. Please check your connection and try again.");
  }
}

// --- Tab Switching Logic ---
function switchTab(tabId) {
  // Hide all tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });

  // Deactivate all tab buttons
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });

  // Show selected tab content and activate button
  document.getElementById(tabId).classList.add('active');
  document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add('active');

  // Load content based on tab
  if (tabId === 'watchlist-tab') {
    displayWatchlist();
  } else if (tabId === 'notifications-tab') {
    displayNotifications();
    markAllNotificationsRead(); // Mark as read when activity tab is viewed
  } else if (tabId === 'profile-tab') {
    // Refresh stats when switching to profile tab
    requestUserStats();
  }
}

// --- Initialization and Event Listeners ---
document.addEventListener("DOMContentLoaded", async () => {
  try {
    // Initialize database first
    await openDB();
    console.log("Database initialized.");

    // --- Check for pending search from context menu ---
    chrome.storage.local.get(['pendingSearch'], async (result) => {
      if (result.pendingSearch) {
        // Clear the pending search immediately to prevent it from being used again
        chrome.storage.local.remove('pendingSearch');
        
        // Fill the search input and trigger the search
        const searchInput = document.getElementById("manual-search-input");
        const searchButton = document.getElementById("manual-search-button");
        if (searchInput && searchButton) {
          searchInput.value = result.pendingSearch;
          searchButton.click(); // Trigger the search
        }
      }
    });

    // --- Gamification: Request initial stats ---
    requestUserStats();
    // --- End Gamification ---

    // Show initial loading state
    updateStatus("Initializing bottle search...", "loading");
    const matchesContainer = document.querySelector(".matches");
    if (matchesContainer) {
      matchesContainer.innerHTML = ""; // Clear any default content
    }

    // Add tab switching event listeners
    document.querySelectorAll('.tab-button').forEach(button => {
      button.addEventListener('click', () => {
        const tabId = button.getAttribute('data-tab');
        switchTab(tabId);
      });
    });

    // Get active tab and trigger content script injection/search
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.id) {
        handleError("Could not get active tab information.");
        return;
      }

      // Only proceed with injection if we have a supported URL
      if (activeTab.url && activeTab.url.startsWith("http")) {
        // Show searching status
        updateStatus("Searching for bottle matches...", "loading");

        try {
          // Get bottle info directly without re-injecting the content script
          const bottleInfo = await new Promise((resolve) => {
            chrome.tabs.sendMessage(activeTab.id, { type: "GET_BOTTLE_INFO" }, (response) => {
              if (chrome.runtime.lastError) {
                console.log("Honey Barrel: Content script not responding or not available on this page.", chrome.runtime.lastError.message);
                resolve(null);
                return;
              }
              resolve(response?.bottleInfo);
            });
          });

          if (bottleInfo) {
             updateStatus("Found bottle! Searching BAXUS...", "loading");

             // Update manual search input placeholder
             const searchInput = document.getElementById("manual-search-input");
             if (searchInput) {
               searchInput.placeholder = `e.g., ${bottleInfo.bottleName}`; // Set placeholder
             }

             // Search BAXUS
             const searchResponse = await new Promise((resolve, reject) => {
               chrome.runtime.sendMessage(
                 { type: "SEARCH_BOTTLE", bottleName: bottleInfo.bottleName },
                 (response) => {
                   if (chrome.runtime.lastError) {
                     reject(new Error("Network error: Unable to connect to BAXUS. Please check your internet connection."));
                     return;
                   }
                   resolve(response);
                 }
               );
             });

             if (searchResponse && searchResponse.error) {
               throw new Error(searchResponse.error);
             }

             if (searchResponse && searchResponse.matches) {
               updateStatus("Similar matches found!", "success");
               const currentPrice = bottleInfo.convertedUsdPrice || bottleInfo.price;
               displayMatches(
                 searchResponse.matches,
                 currentPrice,
                 bottleInfo.price,
                 bottleInfo.currency
               );
             } else {
               handleError("No matches found for the bottle on this page.");
               showNoMatches(false);
             }
          } else {
            // If no bottle info, don't show error, just maybe prompt manual search
            updateStatus("Could not detect bottle info. Try manual search?", "info");
            showNoMatches(false); // Show no matches, but not as an error
          }

        } catch (error) {
          console.error("Error during bottle search:", error);
          handleError(error.message);
        }
      } else {
        handleError("Cannot run on this page type.");
      }
    });

    // Add manual search event listeners
    const searchButton = document.getElementById("manual-search-button");
    const searchInput = document.getElementById("manual-search-input");
    const cancelButton = document.getElementById("cancel-search-button");

    if (searchButton && searchInput && cancelButton) {
      searchButton.addEventListener("click", performManualSearch);
      cancelButton.addEventListener("click", cancelManualSearch);

      searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          performManualSearch();
        }
      });
    }

    // Restore last active tab or default to 'matches-tab'
    const lastTab = localStorage.getItem('activeTab') || 'matches-tab';
    switchTab(lastTab); // Switch tab after initial setup

    // On load, update badge (after potential tab switch)
    updateNotificationsBadge();

  } catch (error) {
    console.error("Error during initialization:", error);
    handleError("Failed to initialize extension");
  }
});

// --- Gamification: Functions to request and display stats, badges, and progress ---
function requestUserStats() {
  chrome.runtime.sendMessage({ type: 'GET_USER_STATS' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn("Error requesting user stats:", chrome.runtime.lastError.message);
      updatePointsDisplay(0); // Default to 0 on error
      displayStreak(0);
      displayBadges([], []); // Display no badges on error
      displayProgress({ points: 0, streak: 0, earnedBadges: [], watchlistCount: 0, dealsFoundCount: 0 }, BADGES); // Display zero progress
      return;
    }
    if (response && typeof response.points !== 'undefined' && Array.isArray(response.earnedBadges) && response.allBadges) {
      updatePointsDisplay(response.points);
      displayStreak(response.streak);
      displayBadges(Object.values(response.allBadges), response.earnedBadges);
      // Display progress using the received stats and badge definitions
      displayProgress(response, response.allBadges);
    } else {
      console.warn("Invalid stats response:", response);
      updatePointsDisplay(0);
      displayStreak(0);
      displayBadges([], []);
      displayProgress({ points: 0, streak: 0, earnedBadges: [], watchlistCount: 0, dealsFoundCount: 0 }, BADGES);
    }
  });
}

function updatePointsDisplay(points) {
  const pointsElement = document.getElementById('points-count');
  if (pointsElement) {
    pointsElement.textContent = points;
  }
}

// --- Gamification: Listen for point updates from background ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'POINTS_UPDATED') {
    console.log("[Popup] Received POINTS_UPDATED:", request);
    updatePointsDisplay(request.newTotal);

    // Add visual feedback to the points counter in profile
    const pointsElement = document.getElementById('points-count');
    if (pointsElement) {
      pointsElement.style.transition = 'transform 0.2s ease-out';
      pointsElement.style.transform = 'scale(1.2)';
      setTimeout(() => {
        pointsElement.style.transform = 'scale(1)';
      }, 200);
    }
  }
  
  if (request.type === 'BADGE_AWARDED') {
    console.log("[Popup] Received BADGE_AWARDED:", request.badge);
    requestUserStats();
  }
});

// --- Gamification: Badge Display Logic ---
function displayBadges(allBadges, earnedBadgeIds) {
    const badgesListContainer = document.getElementById('badges-list');
    const noBadgesMessage = badgesListContainer?.querySelector('.no-badges');

    if (!badgesListContainer) return;

    // Clear previous badges, but keep the no-badges message if it exists
    Array.from(badgesListContainer.children).forEach(child => {
        if (child !== noBadgesMessage) {
            child.remove();
        }
    });

    if (!allBadges || allBadges.length === 0) {
        if (noBadgesMessage) noBadgesMessage.style.display = 'block';
        return;
    }

    if (noBadgesMessage) noBadgesMessage.style.display = 'none';

    // Sort badges: earned first, then by name
    const sortedBadges = allBadges.sort((a, b) => {
        const isEarnedA = earnedBadgeIds.includes(a.id);
        const isEarnedB = earnedBadgeIds.includes(b.id);
        if (isEarnedA && !isEarnedB) return -1;
        if (!isEarnedA && isEarnedB) return 1;
        return a.name.localeCompare(b.name);
    });


    sortedBadges.forEach(badge => {
        const isEarned = earnedBadgeIds.includes(badge.id);
        const badgeElement = document.createElement('div');
        badgeElement.className = `badge-item ${isEarned ? 'earned' : ''}`; // Use class for styling
        badgeElement.title = `${badge.name}\n\n${badge.description}`; // Tooltip

        // Use <i> for Font Awesome icons
        const badgeIcon = document.createElement('i');
        badgeIcon.className = `badge-item-icon ${badge.icon || 'fas fa-trophy'}`; // Add Font Awesome class, default to trophy
        badgeElement.appendChild(badgeIcon);

        const badgeName = document.createElement('span');
        badgeName.className = 'badge-item-name';
        badgeName.textContent = badge.name;
        badgeElement.appendChild(badgeName);

        badgesListContainer.appendChild(badgeElement);
    });
}

// --- Gamification: Progress Display Logic ---
function displayProgress(stats, allBadges) {
    const progressWatchlist = document.getElementById('progress-watchlist');
    const progressDeals = document.getElementById('progress-deals');
    const progressStreak = document.getElementById('progress-streak');
    const progressAllDone = document.getElementById('progress-all-done');

    if (!progressWatchlist || !progressDeals || !progressStreak || !progressAllDone) {
        console.warn("Progress elements not found in popup.html");
        return;
    }

    let allMilestonesAchieved = true;

    // Watchlist Enthusiast Progress
    const watchlistBadge = Object.values(allBadges).find(b => b.id === 'watchlist_enthusiast');
    if (watchlistBadge && !stats.earnedBadges.includes(watchlistBadge.id)) {
        const current = stats.watchlistCount || 0;
        const threshold = watchlistBadge.criteria.threshold;
        progressWatchlist.style.display = 'block';
        progressWatchlist.querySelector('.progress-value').textContent = `${current}/${threshold}`;
        const progressBar = progressWatchlist.querySelector('.progress-bar');
        const progressPercent = Math.min((current / threshold) * 100, 100);
        progressBar.style.width = `${progressPercent}%`;
        allMilestonesAchieved = false;
    } else {
        progressWatchlist.style.display = 'none';
    }

    // Bargain Hunter Progress
    const dealsBadge = Object.values(allBadges).find(b => b.id === 'deal_finder');
     if (dealsBadge && !stats.earnedBadges.includes(dealsBadge.id)) {
        const current = stats.dealsFoundCount || 0;
        const threshold = dealsBadge.criteria.threshold;
        progressDeals.style.display = 'block';
        progressDeals.querySelector('.progress-value').textContent = `${current}/${threshold}`;
        const progressBar = progressDeals.querySelector('.progress-bar');
        const progressPercent = Math.min((current / threshold) * 100, 100);
        progressBar.style.width = `${progressPercent}%`;
        allMilestonesAchieved = false;
    } else {
        progressDeals.style.display = 'none';
    }

    // Daily Discoverer Progress (towards 7-day streak)
    const streakBadge = Object.values(allBadges).find(b => b.id === 'streak_master');
    if (streakBadge && !stats.earnedBadges.includes(streakBadge.id)) {
        const current = stats.streak || 0;
        const threshold = streakBadge.criteria.threshold; // This is 7 for Streak Master
        progressStreak.style.display = 'block';
        progressStreak.querySelector('.progress-value').textContent = `${current}/${threshold} days`;
        const progressBar = progressStreak.querySelector('.progress-bar');
        const progressPercent = Math.min((current / threshold) * 100, 100);
        progressBar.style.width = `${progressPercent}%`;
         allMilestonesAchieved = false;
    } else {
        progressStreak.style.display = 'none';
    }

    // Show "All Done" message if no progress items are displayed
    if (allMilestonesAchieved) {
        progressAllDone.style.display = 'block';
    } else {
        progressAllDone.style.display = 'none';
    }
}


// --- Gamification: Listen for badge awarded message ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'BADGE_AWARDED') {
        console.log("[Popup] Received BADGE_AWARDED:", request.badge);
        // Refresh stats to update badge display and progress
        requestUserStats();
    }
});
