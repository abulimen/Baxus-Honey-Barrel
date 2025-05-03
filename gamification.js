// gamification.js - Handles points and streak logic

// --- Constants ---
export const POINTS = {
  VIEW_PRODUCT: 5,
  ADD_WATCHLIST: 10,
  FIND_MATCH: 20,
  SHARE_DEAL: 15,
  DAILY_STREAK_BONUS: 5,
};

const STORAGE_KEYS = {
  USER_POINTS: 'userPoints',
  STREAK_COUNT: 'honeyBarrelStreakCount',
  LAST_STREAK_UPDATE: 'honeyBarrelLastStreakUpdate',
  VIEWED_URLS: 'honeyBarrelViewedUrls',
  SEARCHED_NAMES: 'honeyBarrelSearchedNames',
  // Badge related storage
  EARNED_BADGES: 'honeyBarrelEarnedBadges',
  WATCHLIST_ADD_COUNT: 'honeyBarrelWatchlistAddCount',
  DEALS_FOUND_COUNT: 'honeyBarrelDealsFoundCount',
  HAS_VIEWED_FIRST_PRODUCT: 'honeyBarrelHasViewedFirstProduct',
  HAS_SHARED_DEAL: 'honeyBarrelHasSharedDeal',
};

const THROTTLE_DURATION_MS = {
  PRODUCT_VIEW: 60 * 60 * 1000, // 1 hour
  SEARCH_POINTS: 24 * 60 * 60 * 1000, // 1 day
};

// --- Points Management ---

/**
 * Gets the current user points from storage.
 * @returns {Promise<number>} The current points.
 */
export async function getPoints() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.USER_POINTS);
    return result[STORAGE_KEYS.USER_POINTS] || 0;
  } catch (error) {
    console.error("Error getting points:", error);
    return 0;
  }
}

/**
 * Adds points to the user's total and saves to storage.
 * Sends a message to update the UI.
 * @param {number} pointsToAdd The number of points to add.
 * @param {string} reason For logging purposes (optional).
 * @returns {Promise<number>} The new total points.
 */
export async function addPoints(pointsToAdd, reason = 'Unknown action') {
  if (pointsToAdd <= 0) return await getPoints(); // Don't add zero or negative points

  try {
    let currentPoints = await getPoints();
    const newTotal = currentPoints + pointsToAdd;
    await chrome.storage.local.set({ [STORAGE_KEYS.USER_POINTS]: newTotal });
    console.log(`[Gamification] Added ${pointsToAdd} points for ${reason}. New total: ${newTotal}`);

    // Notify popup UI about the update, including points added and reason
    chrome.runtime.sendMessage({
      type: 'POINTS_UPDATED',
      newTotal: newTotal,
      pointsAdded: pointsToAdd,
      reason: reason
    }).catch(err => {
      // Ignore error if popup is not open
      if (err.message !== 'Could not establish connection. Receiving end does not exist.') {
        console.error("Error sending POINTS_UPDATED message:", err);
      }
    });

    return newTotal;
  } catch (error) {
    console.error("Error adding points:", error);
    return await getPoints(); // Return current points on error
  }
}

// --- Badge Definitions ---
export const BADGES = {
  NEWBIE_EXPLORER: {
    id: 'newbie_explorer',
    name: 'First Pour', // New interesting name
    description: 'Viewed your first product page.',
    icon: 'fas fa-glass-whiskey', // Font Awesome icon
    criteria: { type: 'flag', key: STORAGE_KEYS.HAS_VIEWED_FIRST_PRODUCT }
  },
  WATCHLIST_ENTHUSIAST: {
    id: 'watchlist_enthusiast',
    name: 'Cellar Builder', // New interesting name
    description: 'Added 10 bottles to your watchlist.',
    icon: 'fas fa-wine-bottle', // Font Awesome icon
    criteria: { type: 'count', key: STORAGE_KEYS.WATCHLIST_ADD_COUNT, threshold: 10 }
  },
  DEAL_FINDER: {
    id: 'deal_finder',
    name: 'Bargain Barrel', // New interesting name
    description: 'Found 5 matching deals on BAXUS.',
    icon: 'fas fa-coins', // Font Awesome icon
    criteria: { type: 'count', key: STORAGE_KEYS.DEALS_FOUND_COUNT, threshold: 5 }
  },
  SOCIAL_SHARER: {
    id: 'social_sharer',
    name: 'Community Taster', // New interesting name
    description: 'Shared a deal on social media.',
    icon: 'fas fa-users', // Font Awesome icon
    criteria: { type: 'flag', key: STORAGE_KEYS.HAS_SHARED_DEAL }
  },
  STREAK_MASTER: {
    id: 'streak_master',
    name: 'Daily Dram', // Retaining this name
    description: 'Maintained a 7-day streak.',
    icon: 'fas fa-calendar-day', // Font Awesome icon
    criteria: { type: 'streak', key: STORAGE_KEYS.STREAK_COUNT, threshold: 7 }
  },
};

// --- Badge Management ---

/**
 * Gets the list of earned badge IDs from storage.
 * @returns {Promise<string[]>} Array of earned badge IDs.
 */
export async function getEarnedBadges() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.EARNED_BADGES);
    return result[STORAGE_KEYS.EARNED_BADGES] || [];
  } catch (error) {
    console.error("Error getting earned badges:", error);
    return [];
  }
}

/**
 * Awards a badge if not already earned and notifies the popup.
 * @param {string} badgeId The ID of the badge to award.
 * @returns {Promise<boolean>} True if the badge was newly awarded, false otherwise.
 */
async function awardBadge(badgeId) {
  try {
    const earnedBadges = await getEarnedBadges();
    if (!earnedBadges.includes(badgeId)) {
      const badge = Object.values(BADGES).find(b => b.id === badgeId);
      if (!badge) {
        console.warn(`[Gamification] Attempted to award unknown badge: ${badgeId}`);
        return false;
      }

      earnedBadges.push(badgeId);
      await chrome.storage.local.set({ [STORAGE_KEYS.EARNED_BADGES]: earnedBadges });
      console.log(`[Gamification] Badge awarded: ${badge.name}`);

      // Notify popup
      chrome.runtime.sendMessage({ type: 'BADGE_AWARDED', badge: badge }).catch(err => {
        if (err.message !== 'Could not establish connection. Receiving end does not exist.') {
          console.error("Error sending BADGE_AWARDED message:", err);
        }
      });

      // --- Browser Notification ---
      chrome.notifications.create(`badge-${badgeId}-${Date.now()}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png', // Use a default icon for now
          title: 'Badge Unlocked!',
          message: `You've earned the "${badge.name}" badge!`,
          priority: 1
      }).catch(err => console.error("Error creating badge notification:", err));
      // --- End Browser Notification ---

      return true; // Newly awarded
    }
    return false; // Already earned
  } catch (error) {
    console.error(`Error awarding badge ${badgeId}:`, error);
    return false;
  }
}

/**
 * Gets the value of a specific counter or flag from storage.
 * @param {string} key The storage key for the counter/flag.
 * @returns {Promise<number|boolean|null>} The value or null on error.
 */
async function getStoredValue(key) {
    try {
        const result = await chrome.storage.local.get(key);
        return result[key]; // Returns undefined if not set, which is fine for checks
    } catch (error) {
        console.error(`Error getting stored value for ${key}:`, error);
        return null;
    }
}

/**
 * Increments a counter in storage.
 * @param {string} key The storage key for the counter.
 * @returns {Promise<number>} The new counter value.
 */
async function incrementStoredCounter(key) {
    try {
        let value = (await getStoredValue(key)) || 0;
        value++;
        await chrome.storage.local.set({ [key]: value });
        return value;
    } catch (error) {
        console.error(`Error incrementing stored counter ${key}:`, error);
        return (await getStoredValue(key)) || 0; // Return current value on error
    }
}

/**
 * Sets a flag in storage.
 * @param {string} key The storage key for the flag.
 * @returns {Promise<void>}
 */
async function setStoredFlag(key) {
    try {
        await chrome.storage.local.set({ [key]: true });
    } catch (error) {
        console.error(`Error setting stored flag ${key}:`, error);
    }
}


/**
 * Checks all unearned badges against their criteria based on the action performed.
 * @param {string} actionType Hint about the action that triggered the check (e.g., 'productView', 'watchlistAdd').
 * @param {object} data Additional data relevant to the action (e.g., { currentStreak: 7 }).
 */
export async function checkAndAwardBadges(actionType, data = {}) {
  try {
    const earnedBadges = await getEarnedBadges();
    const badgesToCheck = Object.values(BADGES).filter(b => !earnedBadges.includes(b.id));

    if (badgesToCheck.length === 0) return; // All badges earned

    console.log(`[Gamification] Checking ${badgesToCheck.length} unearned badges after action: ${actionType}`);

    for (const badge of badgesToCheck) {
      const criteria = badge.criteria;
      let criteriaMet = false;

      switch (criteria.type) {
        case 'flag':
          // Check if the flag associated with this badge is now true
          const flagValue = await getStoredValue(criteria.key);
          if (flagValue === true) {
            criteriaMet = true;
          }
          break;
        case 'count':
          // Check if the counter associated with this badge meets the threshold
          const countValue = (await getStoredValue(criteria.key)) || 0;
          if (countValue >= criteria.threshold) {
            criteriaMet = true;
          }
          break;
        case 'streak':
          // Check if the current streak (passed in data) meets the threshold
          const currentStreak = data.currentStreak !== undefined ? data.currentStreak : (await getStreakData()).streak;
          if (currentStreak >= criteria.threshold) {
            criteriaMet = true;
          }
          break;
        // Add other criteria types if needed
      }

      if (criteriaMet) {
        await awardBadge(badge.id);
      }
    }
  } catch (error) {
    console.error("Error checking/awarding badges:", error);
  }
}


// --- Streak Management ---

/**
 * Gets the current streak data from storage.
 * @returns {Promise<{streak: number, lastUpdate: number | null}>}
 */
export async function getStreakData() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.STREAK_COUNT,
      STORAGE_KEYS.LAST_STREAK_UPDATE,
    ]);
    return {
      streak: result[STORAGE_KEYS.STREAK_COUNT] || 0,
      lastUpdate: result[STORAGE_KEYS.LAST_STREAK_UPDATE] || null,
    };
  } catch (error) {
    console.error("Error getting streak data:", error);
    return { streak: 0, lastUpdate: null };
  }
}

/**
 * Updates the daily streak based on the last update time.
 * Awards bonus points if the streak continues.
 * @returns {Promise<{updatedStreak: number, bonusAwarded: number}>}
 */
export async function updateStreak() {
  try {
    const { streak, lastUpdate } = await getStreakData();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of today
    let updatedStreak = streak;
    let bonusAwarded = 0;

    if (lastUpdate) {
      const lastUpdateDate = new Date(lastUpdate);
      const lastStreakDay = new Date(lastUpdateDate.getFullYear(), lastUpdateDate.getMonth(), lastUpdateDate.getDate()); // Start of last update day

      const diffTime = today.getTime() - lastStreakDay.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        // Consecutive day
        updatedStreak++;
        bonusAwarded = POINTS.DAILY_STREAK_BONUS;
        await addPoints(bonusAwarded, `Daily streak bonus (Day ${updatedStreak})`);
        console.log(`[Gamification] Streak continued! Day ${updatedStreak}. Awarded ${bonusAwarded} bonus points.`);

        // --- Browser Notification for Streak Milestones ---
        if ([3, 7].includes(updatedStreak)) { // Notify at 3 and 7 days
            chrome.notifications.create(`streak-${updatedStreak}-${Date.now()}`, {
                type: 'basic',
                iconUrl: 'icons/icon128.png',
                title: 'Streak Milestone!',
                message: `You've maintained a ${updatedStreak}-day streak! Keep it up! 🔥`,
                priority: 1
            }).catch(err => console.error("Error creating streak notification:", err));
        }
        // --- End Browser Notification ---

      } else if (diffDays > 1) {
        // Streak broken
        updatedStreak = 1; // Start new streak
        console.log("[Gamification] Streak broken. Starting new streak.");
      }
      // If diffDays is 0 (same day), do nothing to streak count
    } else {
      // First time action, start streak
      updatedStreak = 1;
      console.log("[Gamification] Starting first streak.");
    }

    // Save updated streak count and timestamp if it changed or was the first time
    if (updatedStreak !== streak || !lastUpdate) {
        await chrome.storage.local.set({
            [STORAGE_KEYS.STREAK_COUNT]: updatedStreak,
            [STORAGE_KEYS.LAST_STREAK_UPDATE]: now.getTime(),
        });
    } else if (lastUpdate) {
        // If streak didn't change but it's a new day, still update the timestamp
        const lastUpdateDate = new Date(lastUpdate);
        const lastStreakDay = new Date(lastUpdateDate.getFullYear(), lastUpdateDate.getMonth(), lastUpdateDate.getDate());
        if (today.getTime() > lastStreakDay.getTime()) {
             await chrome.storage.local.set({
                [STORAGE_KEYS.LAST_STREAK_UPDATE]: now.getTime(),
            });
        }
    }


    return { updatedStreak, bonusAwarded };
  } catch (error) {
    console.error("Error updating streak:", error);
    return { updatedStreak: 0, bonusAwarded: 0 };
  }
}

// --- Throttling Helpers ---

/**
 * Checks if points for viewing a specific URL have been awarded recently.
 * Records the view if not throttled.
 * @param {string} url The URL of the product page.
 * @returns {Promise<boolean>} True if the action should be throttled, false otherwise.
 */
export async function isProductViewThrottled(url) {
  if (!url) return true; // Don't award points if URL is missing
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.VIEWED_URLS);
    const viewedUrls = result[STORAGE_KEYS.VIEWED_URLS] || {};
    const now = Date.now();

    if (viewedUrls[url] && (now - viewedUrls[url] < THROTTLE_DURATION_MS.PRODUCT_VIEW)) {
      console.log(`[Gamification] Throttled point award for viewing URL: ${url}`);
      return true; // Throttled
    }

    // Not throttled, record the view timestamp
    viewedUrls[url] = now;
    // Clean up old entries (optional, but good practice)
    for (const key in viewedUrls) {
      if (now - viewedUrls[key] >= THROTTLE_DURATION_MS.PRODUCT_VIEW) {
        delete viewedUrls[key];
      }
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.VIEWED_URLS]: viewedUrls });
    return false; // Not throttled
  } catch (error) {
    console.error("Error checking product view throttle:", error);
    return true; // Throttle on error
  }
}

/**
 * Checks if points for searching a specific bottle name have been awarded recently.
 * Records the search if not throttled.
 * @param {string} bottleName The name of the bottle searched.
 * @returns {Promise<boolean>} True if the action should be throttled, false otherwise.
 */
export async function isSearchPointsThrottled(bottleName) {
    if (!bottleName) return true;
    const normalizedName = bottleName.toLowerCase().trim();
    if (!normalizedName) return true;

    try {
        const result = await chrome.storage.local.get(STORAGE_KEYS.SEARCHED_NAMES);
        const searchedNames = result[STORAGE_KEYS.SEARCHED_NAMES] || {};
        const now = Date.now();

        if (searchedNames[normalizedName] && (now - searchedNames[normalizedName] < THROTTLE_DURATION_MS.SEARCH_POINTS)) {
            console.log(`[Gamification] Throttled point award for search: ${normalizedName}`);
            return true; // Throttled
        }

        // Not throttled, record the search timestamp
        searchedNames[normalizedName] = now;
        // Clean up old entries
        for (const key in searchedNames) {
            if (now - searchedNames[key] >= THROTTLE_DURATION_MS.SEARCH_POINTS) {
                delete searchedNames[key];
            }
        }
        await chrome.storage.local.set({ [STORAGE_KEYS.SEARCHED_NAMES]: searchedNames });
        return false; // Not throttled
    } catch (error) {
        console.error("Error checking search points throttle:", error);
        return true; // Throttle on error
    }
}


// --- Combined Stats ---

/**
 * Gets both points and streak data.
 * @returns {Promise<{points: number, streak: number, earnedBadges: string[], watchlistCount: number, dealsFoundCount: number}>}
 */
export async function getUserStats() {
    try {
        const points = await getPoints();
        const { streak } = await getStreakData();
        const earnedBadges = await getEarnedBadges();
        const watchlistCount = await getWatchlistAddCount();
        const dealsFoundCount = await getDealsFoundCount();
        return { points, streak, earnedBadges, watchlistCount, dealsFoundCount };
    } catch (error) {
        console.error("Error getting user stats:", error);
        return { points: 0, streak: 0, earnedBadges: [], watchlistCount: 0, dealsFoundCount: 0 };
    }
}

// --- Action-specific Counter/Flag Updates ---

export async function recordProductView() {
    const alreadySet = await getStoredValue(STORAGE_KEYS.HAS_VIEWED_FIRST_PRODUCT);
    if (!alreadySet) {
        await setStoredFlag(STORAGE_KEYS.HAS_VIEWED_FIRST_PRODUCT);
        await checkAndAwardBadges('productView'); // Check immediately after setting flag
    }
}

export async function recordWatchlistAdd() {
    await incrementStoredCounter(STORAGE_KEYS.WATCHLIST_ADD_COUNT);
    await checkAndAwardBadges('watchlistAdd'); // Check immediately after incrementing
}

export async function recordMatchFound() {
    await incrementStoredCounter(STORAGE_KEYS.DEALS_FOUND_COUNT);
    await checkAndAwardBadges('matchFound'); // Check immediately after incrementing
}

export async function recordDealShare() {
    const alreadySet = await getStoredValue(STORAGE_KEYS.HAS_SHARED_DEAL);
    if (!alreadySet) {
        await setStoredFlag(STORAGE_KEYS.HAS_SHARED_DEAL);
    await checkAndAwardBadges('dealShared'); // Check immediately after setting flag
  }
}

// --- Specific Count Getters (needed for progress display) ---

export async function getWatchlistAddCount() {
    return (await getStoredValue(STORAGE_KEYS.WATCHLIST_ADD_COUNT)) || 0;
}

export async function getDealsFoundCount() {
    return (await getStoredValue(STORAGE_KEYS.DEALS_FOUND_COUNT)) || 0;
}
