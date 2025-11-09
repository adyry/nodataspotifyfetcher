# NoData.tv to Spotify Automation

This script automates the process of scraping album data from nodata.tv and adding them to a Spotify playlist.

## Features

- Scrapes album/artist data from nodata.tv blog pages
- Searches for albums on Spotify
- Retrieves all tracks from found albums
- Adds tracks to your specified Spotify playlist
- Handles rate limiting and errors gracefully

## Installation

```bash
npm install
```

## Configuration

Edit `index.js` and update the following constants:

- `SPOTIFY_TOKEN`: Your Spotify Bearer token
- `PLAYLIST_ID`: Your Spotify playlist ID (default: `6fSJPnnTX5jyAeA4Q8a0HD`)
- `START_PAGE`: Starting page number (default: 1)
- `END_PAGE`: Ending page number (default: 5)

### Getting a Spotify Token

1. Go to https://developer.spotify.com/console/post-playlists-tracks/
2. Click "Get Token"
3. Select the required scopes: `playlist-modify-public` and `playlist-modify-private`
4. Copy the token and update `SPOTIFY_TOKEN` in the script

**Note:** Spotify tokens expire after 1 hour. You'll need to generate a new one when it expires.

## Usage

```bash
npm start
```

The script will:
1. Fetch albums from each page (1 to END_PAGE)
2. Search for each album on Spotify
3. Get all tracks from found albums
4. Add tracks to your playlist
5. Display progress and summary

## Example Output

```
🎵 Starting NoData.tv to Spotify automation
   Pages: 1 to 5
   Playlist ID: 6fSJPnnTX5jyAeA4Q8a0HD

📄 Fetching page 1: https://nodata.tv/blog/page/1
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

## Notes

- The script adds tracks to the beginning of the playlist (position 0)
- Maximum 100 tracks can be added per request (handled automatically)
- Album matching uses Spotify's search with artist and album name
- Date markers like `[2024]` are automatically removed from scraped data
