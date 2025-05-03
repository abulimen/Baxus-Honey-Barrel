# Honey Barrel (BAXUS Marketplace Integration)


## Overview

Honey Barrel is a powerful Chrome extension designed for whisky and wine enthusiasts. It automatically scans product pages on a wide variety of retail websites – from large general marketplaces like **Amazon** to specialized drink retailers such as **The Whisky Exchange, Total Wine & More, Drizly, ReserveBar, Caskers**, and many others – identifying the bottle being viewed and cross-referencing it with the BAXUS marketplace. The extension then displays comparable listings from BAXUS directly within the popup, highlighting potential savings and providing direct links to the marketplace. It features a watchlist to track desired bottles, notifications for price drops, and a gamification system to reward user engagement.

## Youtube Video: https://youtu.be/qbL04LoJ8A4

## Table of Contents

*   [Key Features](#key-features)
*   [Getting Started](#getting-started)
    *   [Installation](#installation)
    *   [Usage](#usage)
*   [Screenshots](#screenshots)
*   [Technical Overview](#technical-overview)
*   [Permissions Explained](#permissions-explained)

## Key Features

Honey Barrel offers a suite of features designed to help you find the best prices for your favorite spirits and wines on the BAXUS marketplace.

### Automatic Bottle Detection

*   **Smart Extraction:** The extension employs multiple techniques (JSON-LD, Microdata, OpenGraph, page titles, headings, common HTML elements) to automatically identify the bottle name and price on a wide range of retail product pages, including major marketplaces and specialized liquor stores.
*   **Robust Parsing:** It intelligently cleans and normalizes extracted names to improve matching accuracy, removing site-specific clutter and common irrelevant terms.
*   **Currency Handling:** Detects the currency on the page and attempts to convert prices to USD for consistent comparison using an external API.

### BAXUS Marketplace Integration & Price Comparison

*   **Multi-Query Search:** Performs targeted searches on the BAXUS API using key terms derived from the detected bottle name.
*   **Intelligent Matching:** Compares search results from BAXUS against the detected bottle using name similarity and shared keywords.
*   **Relevance Sorting:** Sorts potential matches based on query relevance, name similarity, and price to present the most likely candidates first.
*   **Savings Calculation:** Clearly displays the potential savings (or cost difference) between the retail page price and the BAXUS listing price.
*   **Direct Links:** Provides direct links to view the matched bottles on the BAXUS website.
*   **API Caching:** Caches BAXUS API responses locally (using IndexedDB) to improve performance and reduce redundant API calls.

### Watchlist Functionality

*   **Save Favorites:** Easily save interesting bottles found on BAXUS to a personal watchlist directly from the extension popup.
*   **Persistent Storage:** Your watchlist is stored locally using IndexedDB, ensuring it persists between browser sessions.
*   **Quick Access:** View your saved bottles, their last seen BAXUS price, and potential savings compared to their originally noted retail price within the dedicated "Watchlist" tab.
*   **Easy Management:** Remove items from your watchlist with a single click.

### Price Drop Notifications

*   **Background Monitoring:** Periodically checks the prices of items in your watchlist against the BAXUS marketplace (currently planned, requires background task implementation).
*   **Configurable Alerts:** Notifies you via Chrome notifications when a significant price drop is detected for a watched item (based on percentage or absolute value thresholds).
*   **Direct Access:** Clicking a notification takes you directly to the relevant BAXUS listing.

### Gamification System

*   **Engagement Rewards:** Earn points for various actions like viewing product pages, finding matches, adding items to the watchlist, and sharing deals.
*   **Streak Tracking:** Maintain a daily streak for finding matches to earn bonus points and unlock achievements.
*   **Badges & Achievements:** Unlock badges for reaching milestones (e.g., adding multiple items to watchlist, finding many deals, maintaining long streaks).
*   **Profile Overview:** Track your points, current streak, and earned badges within the "Profile" tab in the extension popup.

### Manual Search

*   **Search Anything:** If automatic detection fails or you want to search for a specific bottle not currently being viewed, use the manual search bar in the popup.
*   **Direct BAXUS Query:** Directly queries the BAXUS marketplace based on your input and displays the results.

### Share Deals

*   **Easy Sharing:** Quickly share exciting deals found on BAXUS via Twitter or copy a pre-formatted message for Discord directly from the match card in the popup.
*   **Gamification Integration:** Earn points for sharing deals.

## Getting Started

Follow these steps to install and start using the Honey Barrel extension.

### Installation

Since this extension is not yet published on the Chrome Web Store, you need to load it manually:

1.  **Download the Extension Files:** Obtain the folder containing the extension files (including `manifest.json`, `popup.html`, etc.). If you have a `.zip` file, unzip it first.
2.  **Open Chrome Extensions Page:** Open Google Chrome, type `chrome://extensions` in the address bar, and press Enter.
3.  **Enable Developer Mode:** In the top-right corner of the Extensions page, toggle the "Developer mode" switch to the ON position.
4.  **Load Unpacked Extension:** Click the "Load unpacked" button that appears (usually on the top-left).
5.  **Select Extension Folder:** In the file dialog that opens, navigate to and select the folder containing the extension's files (the folder that has `manifest.json` inside it).
6.  **Installation Complete:** The Honey Barrel extension icon should now appear in your Chrome toolbar, and the extension is ready to use.

### Usage

1.  **Browse Retail Sites:** Navigate to a product page for a whisky or wine bottle on virtually any retail website (e.g., Amazon, The Whisky Exchange, Total Wine, local liquor store sites).
2.  **Automatic Detection:** The extension's content script will attempt to automatically detect the bottle name and price on the page.
3.  **Open the Popup:** Click the Honey Barrel icon in your Chrome toolbar.
4.  **View Matches:** The popup will initially show a loading state while it searches the BAXUS marketplace. If matches are found, they will be displayed in the "Search" tab, showing the BAXUS price, potential savings, and links to view the item on BAXUS.
5.  **Use Tabs:**
    *   **Search:** View current matches for the bottle on the page or use the manual search bar.
    *   **Watchlist:** View and manage bottles you have saved.
    *   **Activity:** See recent notifications (like price drops or earned badges).
    *   **Profile:** Check your gamification points, streak, and earned badges.
6.  **Save to Watchlist:** Click the heart icon on a match card to save it to your watchlist.
7.  **Share Deals:** Use the Twitter or Discord buttons on a match card to share the deal.
8.  **Manual Search:** If automatic detection doesn't work, or you want to search for something else, type a bottle name into the search bar at the top of the "Search" tab and press Enter or click the search icon.

## Technical Overview

Honey Barrel utilizes standard Chrome extension technologies (Manifest V3) to interact with web pages and the BAXUS marketplace.

### Core Components

*   **Content Script (`content.js`):** Injected into retail web pages. Responsible for detecting product information (name, price) using various DOM parsing techniques and communicating this information to the background script.
*   **Background Service Worker (`background.js`):** Acts as the central hub. Handles communication with the BAXUS API, performs searches, manages caching, implements gamification logic (points, streaks, badges), and orchestrates communication between the content script and the popup.
*   **Popup (`popup.html`, `popup.js`):** Provides the user interface. Displays search results, watchlist items, activity notifications, and profile/gamification stats. Handles user interactions like manual search, saving/removing watchlist items, and sharing.
*   **Database (`db.js`):** A helper module using IndexedDB for persistent local storage of the watchlist, notifications, and API cache.
*   **Gamification (`gamification.js`):** Contains the logic for awarding points, tracking streaks, defining badges, and managing user stats stored in `chrome.storage.local`.

### Data Handling

*   **IndexedDB:** Used for storing structured data locally, including the user's watchlist, notification history, and cached BAXUS API responses. This ensures data persistence and offline access for certain features.
*   **`chrome.storage.local`:** Used for storing simpler key-value data like gamification stats (points, streak progress, earned badges) and user settings.

### APIs Used

*   **BAXUS API (`https://services.baxus.co/api/search/listings`):** Queried by the background script to search for bottle listings on the BAXUS marketplace.
*   **Currency Conversion API (`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json`):** Used by the content script to fetch exchange rates for converting prices found on retail pages to USD.

## Permissions Explained

The extension requests the following permissions, necessary for its core functionality:

*   **`activeTab`:** Allows the extension to temporarily access the currently active tab when the user invokes the extension (e.g., clicks the popup icon). Used primarily if scripting injection is needed on demand, though current implementation uses `scripting` and `host_permissions`.
*   **`storage`:** Allows the extension to store data locally using `chrome.storage.local` (for gamification stats) and IndexedDB (via `db.js` for watchlist, notifications, cache).
*   **`scripting`:** Allows the extension to inject the content script (`content.js`) into web pages to extract bottle information.
*   **`webRequest`:** (Potentially needed for future features like intercepting network requests, though not strictly required for current core functionality based on examined code. May be included for broader compatibility or planned features).
*   **`notifications`:** Allows the extension to display desktop notifications, primarily for price drop alerts on watched items.
*   **`alarms`:** Allows the extension to schedule periodic tasks in the background, such as checking watchlist prices (used for `WATCHLIST_CHECK_ALARM_NAME`).
*   **`contextMenus`:** Allows adding options to the right-click context menu (e.g., for initiating a manual search based on selected text - a potential feature).
*   **`host_permissions: ["<all_urls>"]`:** Required by the `scripting` permission to allow the content script to run on potentially any retail website the user visits. Also allows background script to fetch data from the BAXUS API and the currency conversion API.


