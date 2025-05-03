// db.js - IndexedDB Helper Functions for Honey Barrel

const DB_NAME = "HoneyBarrelDB";
const DB_VERSION = 3; // Increment version for cache schema
const WATCHLIST_STORE_NAME = "watchlist";
const NOTIFICATIONS_STORE_NAME = "notifications";
const API_CACHE_STORE_NAME = "apiCache"; // New store for API caching

let db = null;

// Function to open the IndexedDB database
async function openDB() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject("IndexedDB error: " + event.target.error);
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      console.log("IndexedDB opened successfully");
      resolve(db);
    };

    // This event is only triggered if the version number changes
    // or if the database is created for the first time.
    request.onupgradeneeded = (event) => {
      console.log("IndexedDB upgrade needed");
      const tempDb = event.target.result;
      const transaction = event.target.transaction; // Get transaction for potential errors

      // Create the watchlist object store if it doesn't exist
      if (!tempDb.objectStoreNames.contains(WATCHLIST_STORE_NAME)) {
        const watchlistStore = tempDb.createObjectStore(WATCHLIST_STORE_NAME, { keyPath: "id" });
        console.log(`Object store '${WATCHLIST_STORE_NAME}' created.`);
      }

      // Create the notifications object store if it doesn't exist (DB_VERSION >= 2)
      if (!tempDb.objectStoreNames.contains(NOTIFICATIONS_STORE_NAME)) {
        const notificationsStore = tempDb.createObjectStore(NOTIFICATIONS_STORE_NAME, { autoIncrement: true });
        notificationsStore.createIndex("timestamp", "timestamp", { unique: false });
        console.log(`Object store '${NOTIFICATIONS_STORE_NAME}' created with 'timestamp' index.`);
      }

      // Create the API cache object store if it doesn't exist (DB_VERSION >= 3)
      if (!tempDb.objectStoreNames.contains(API_CACHE_STORE_NAME)) {
        // Use the API query/URL as the keyPath
        const cacheStore = tempDb.createObjectStore(API_CACHE_STORE_NAME, { keyPath: "queryKey" });
        // Add index for timestamp to allow clearing old cache
        cacheStore.createIndex("timestamp", "timestamp", { unique: false });
        console.log(`Object store '${API_CACHE_STORE_NAME}' created with 'timestamp' index.`);
      }

      transaction.onerror = (event) => {
        console.error("Error during DB upgrade transaction:", event.target.error);
      };
      transaction.oncomplete = () => {
        console.log("DB upgrade transaction completed.");
      };

      // Handle future upgrades here if DB_VERSION increases further
    };
  });
}

// Function to add or update an item in the watchlist
async function saveToWatchlist(bottle) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([WATCHLIST_STORE_NAME], "readwrite");
    const store = transaction.objectStore(WATCHLIST_STORE_NAME);
    
    // Get existing item to preserve original retail price if updating
    const getRequest = store.get(bottle.id);
    getRequest.onsuccess = (event) => {
        const existingItem = event.target.result;
        
        // Prepare the data to be saved
        const dataToSave = { ...bottle }; // Copy incoming data
        dataToSave.savedAt = new Date(); // Add/update saved timestamp
        
        // If it's a new item or retailPrice is missing, set it
        if (!existingItem || !existingItem.retailPrice) {
            dataToSave.retailPrice = bottle.retailPrice || bottle.price; // Use provided retailPrice or fallback to current price
        }
        
        // Always update lastSeenPrice with the current BAXUS price
        dataToSave.lastSeenPrice = bottle.price;
        
        // If updating, merge with existing data, preserving original retailPrice
        if (existingItem) {
            dataToSave.retailPrice = existingItem.retailPrice; // Keep original retail price
        }

        const putRequest = store.put(dataToSave);
        putRequest.onsuccess = () => {
            console.log(`Bottle ${bottle.id} saved/updated in watchlist.`);
            resolve(true);
        };
        putRequest.onerror = (event) => {
            console.error("Error saving/updating bottle:", event.target.error);
            reject("Error saving/updating bottle: " + event.target.error);
        };
    };
    getRequest.onerror = (event) => {
        console.error("Error getting existing bottle:", event.target.error);
        reject("Error getting existing bottle: " + event.target.error);
    };
  });
}

// Function to remove an item from the watchlist by ID
async function removeFromWatchlist(bottleId) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([WATCHLIST_STORE_NAME], "readwrite");
    const store = transaction.objectStore(WATCHLIST_STORE_NAME);
    const request = store.delete(bottleId);

    request.onsuccess = () => {
      console.log(`Bottle ${bottleId} removed from watchlist.`);
      resolve(true);
    };

    request.onerror = (event) => {
      console.error("Error removing bottle:", event.target.error);
      reject("Error removing bottle: " + event.target.error);
    };
  });
}

// Function to get all items from the watchlist
async function getWatchlistItems() {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([WATCHLIST_STORE_NAME], "readonly");
    const store = transaction.objectStore(WATCHLIST_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (event) => {
      resolve(event.target.result || []);
    };

    request.onerror = (event) => {
      console.error("Error getting watchlist items:", event.target.error);
      reject("Error getting watchlist items: " + event.target.error);
    };
  });
}

// Function to get a single item from the watchlist by ID
async function getWatchlistItemById(bottleId) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([WATCHLIST_STORE_NAME], "readonly");
    const store = transaction.objectStore(WATCHLIST_STORE_NAME);
    const request = store.get(bottleId);

    request.onsuccess = (event) => {
      resolve(event.target.result); // Returns the item or undefined if not found
    };

    request.onerror = (event) => {
      console.error("Error getting watchlist item by ID:", event.target.error);
      reject("Error getting watchlist item by ID: " + event.target.error);
    };
  });
}

// --- Notification Store Functions ---

// Function to add a notification to the store
async function saveNotification(notificationData) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([NOTIFICATIONS_STORE_NAME], "readwrite");
    const store = transaction.objectStore(NOTIFICATIONS_STORE_NAME);
    // Add timestamp if not already present
    if (!notificationData.timestamp) {
      notificationData.timestamp = new Date();
    }
    const request = store.add(notificationData);

    request.onsuccess = (event) => {
      console.log("Notification saved with key:", event.target.result);
      resolve(event.target.result); // Return the key of the added notification
    };

    request.onerror = (event) => {
      console.error("Error saving notification:", event.target.error);
      reject("Error saving notification: " + event.target.error);
    };
  });
}

// Function to get notifications, sorted by timestamp descending
async function getNotifications(limit = 50) { // Default limit to 50
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([NOTIFICATIONS_STORE_NAME], "readonly");
    const store = transaction.objectStore(NOTIFICATIONS_STORE_NAME);
    const index = store.index("timestamp"); // Use the timestamp index
    const request = index.getAll(null, limit); // Get all, but limit results

    // Note: getAll() doesn't directly support reverse order + limit easily across browsers.
    // We'll sort in memory after getting the results.

    request.onsuccess = (event) => {
      const results = event.target.result || [];
      // Sort descending by timestamp
      results.sort((a, b) => b.timestamp - a.timestamp);
      resolve(results.slice(0, limit)); // Apply limit after sorting
    };

    request.onerror = (event) => {
      console.error("Error getting notifications:", event.target.error);
      reject("Error getting notifications: " + event.target.error);
    };
  });
}

// Optional: Function to clear old notifications (e.g., keep only last 100)
async function clearOldNotifications(keepCount = 100) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([NOTIFICATIONS_STORE_NAME], "readwrite");
    const store = transaction.objectStore(NOTIFICATIONS_STORE_NAME);
    const index = store.index("timestamp");
    let cursorReq = index.openCursor(null, "prev"); // Open cursor in reverse order
    let count = 0;

    cursorReq.onsuccess = event => {
      const cursor = event.target.result;
      if (cursor) {
        count++;
        if (count > keepCount) {
          cursor.delete(); // Delete older entries
        }
        cursor.continue();
      } else {
        console.log(`Cleared old notifications, kept ${Math.min(count, keepCount)}.`);
        resolve();
      }
    };
    cursorReq.onerror = event => {
      console.error("Error clearing old notifications:", event.target.error);
      reject("Error clearing old notifications: " + event.target.error);
    };
  });
}


// --- API Cache Store Functions ---

// Function to get cached API response
async function getCachedApiResponse(queryKey) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([API_CACHE_STORE_NAME], "readonly");
    const store = transaction.objectStore(API_CACHE_STORE_NAME);
    const request = store.get(queryKey);

    request.onsuccess = (event) => {
      resolve(event.target.result); // Returns cache entry or undefined
    };

    request.onerror = (event) => {
      console.error("Error getting cached API response:", event.target.error);
      reject("Error getting cached API response: " + event.target.error);
    };
  });
}

// Function to save API response to cache
async function saveApiResponseToCache(queryKey, data) {
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([API_CACHE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(API_CACHE_STORE_NAME);
    const cacheEntry = {
      queryKey: queryKey,
      data: data,
      timestamp: new Date()
    };
    const request = store.put(cacheEntry);

    request.onsuccess = () => {
      console.log(`API response for key "${queryKey}" saved to cache.`);
      resolve(true);
    };

    request.onerror = (event) => {
      console.error("Error saving API response to cache:", event.target.error);
      reject("Error saving API response to cache: " + event.target.error);
    };
  });
}

// Optional: Function to clear expired cache entries
async function clearExpiredCache(maxAgeMinutes = 60) { // Default cache age: 1 hour
  const dbInstance = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = dbInstance.transaction([API_CACHE_STORE_NAME], "readwrite");
    const store = transaction.objectStore(API_CACHE_STORE_NAME);
    const index = store.index("timestamp");
    const cutoffDate = new Date(Date.now() - maxAgeMinutes * 60 * 1000);
    let cursorReq = index.openCursor(IDBKeyRange.upperBound(cutoffDate)); // Cursor for entries older than cutoff

    cursorReq.onsuccess = event => {
      const cursor = event.target.result;
      if (cursor) {
        console.log(`Deleting expired cache entry with key: ${cursor.primaryKey}`);
        cursor.delete();
        cursor.continue();
      } else {
        console.log("Finished clearing expired cache entries.");
        resolve();
      }
    };
    cursorReq.onerror = event => {
      console.error("Error clearing expired cache:", event.target.error);
      reject("Error clearing expired cache: " + event.target.error);
    };
  });
}


// Export functions if using modules, otherwise they are globally available in the script context
// Example for potential module usage (adjust based on how you include the script):
export { openDB, saveToWatchlist, removeFromWatchlist, getWatchlistItems, getWatchlistItemById, saveNotification, getNotifications, clearOldNotifications, getCachedApiResponse, saveApiResponseToCache, clearExpiredCache };

