# NoData.tv to Spotify Automation

This script automates the process of scraping album data from nodata.tv and adding them to a Spotify playlist.

## Features

- Scrapes album/artist data from nodata.tv blog pages
- Searches for albums on Spotify
- Retrieves all tracks from found albums
- Adds tracks to your specified Spotify playlist
- Handles rate limiting and errors gracefully
- **Tracks albums not found on Spotify** and saves them to a markdown file with clickable links

## Installation

```bash
npm install
```

## Configuration

### 1. Set up Spotify App

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Log in with your Spotify account
3. Click "Create app"
4. Fill in the app details:
   - App name: (e.g., "NoData Fetcher")
   - App description: (e.g., "Script to add albums to playlist")
   - Redirect URI: `http://localhost:3000/callback`
5. Save your app and note down the **Client ID** and **Client Secret**

### 2. Configure Environment Variables

Create a `.env` file in the project root (or set environment variables):

```bash
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here
```

Alternatively, you can edit `index.js` and replace the placeholder values directly.

### 3. Configure Script Settings

Edit `index.js` and update the following constants:

- `PLAYLIST_ID`: Your Spotify playlist ID (default: `6fSJPnnTX5jyAeA4Q8a0HD`)
- `START_PAGE`: Starting page number (default: 1)
- `END_PAGE`: Ending page number (default: 5)

### How to Get Playlist ID

The playlist ID is in the URL when viewing a playlist on Spotify:
- Example URL: `https://open.spotify.com/playlist/6fSJPnnTX5jyAeA4Q8a0HD`
- Playlist ID: `6fSJPnnTX5jyAeA4Q8a0HD`

## Usage

```bash
npm start
```

### First Run - Authentication

On the first run, the script will:
1. Start a local authentication server on `http://localhost:3000`
2. Display a URL to open in your browser: `http://localhost:3000/login`
3. Redirect you to Spotify to authorize the app
4. After authorization, redirect you back and display a success message
5. The script will automatically continue with the scraping process

**Note:** The access token is valid for 1 hour and will be automatically refreshed when needed.

### Normal Operation

The script will:
1. Authenticate with Spotify (or use existing token)
2. Fetch albums from each page (START_PAGE to END_PAGE)
3. Search for each album on Spotify
4. Get all tracks from found albums
5. Add tracks to your playlist
6. Display progress and summary

## Example Output

```
🎵 Starting NoData.tv to Spotify automation
   Pages: 1 to 5
   Playlist ID: 6fSJPnnTX5jyAeA4Q8a0HD

� Starting authentication...
👉 Please open this URL in your browser:
   http://localhost:3000/login

🌐 Auth server listening on http://localhost:3000

✅ Authentication successful! Access token obtained.

�📄 Fetching page 1: https://nodata.tv/blog/page/1
   Found 10 albums on page 1

[1] Processing: "Numbers Game EP" by DJ Aakmael
   ✓ Found: "Numbers Game EP" by DJ Aakmael (ID: 4GVduvMZhj44TETvpGyf4r)
   ✓ Got 4 tracks from album
   ✓ Added 4 tracks to playlist
```

## Rate Limiting

The script includes delays to avoid hitting Spotify's rate limits:
- 300ms between API calls
- 500ms after adding tracks
- 1000ms between pages

## Error Handling

- Invalid/expired tokens are detected and reported
- Albums not found on Spotify are logged and skipped
- Network errors are caught and logged
- Script continues processing remaining albums after errors

## Not Found Albums

When albums aren't found on Spotify, the script automatically creates a markdown file (e.g., `not-found-albums-2025-11-09.md`) with:
- Clickable links to each album's nodata.tv page
- Artist and album name
- Total count of not found albums

Example format:
```markdown
# Albums Not Found on Spotify

Generated: 11/9/2025, 3:45:30 PM
Total: 5 albums

---

1. [Artist Name - Album Title](https://nodata.tv/blog/post-url)
2. [Another Artist - Another Album](https://nodata.tv/blog/other-url)
```

This makes it easy to manually check and potentially add these albums later.

## Notes

- The script adds tracks to the beginning of the playlist (position 0)
- Maximum 100 tracks can be added per request (handled automatically)
- Album matching uses Spotify's search with artist and album name
- Date markers like `[2024]` are automatically removed from scraped data
