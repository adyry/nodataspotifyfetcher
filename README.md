# NoData.tv to Spotify Automation

This script automates the process of scraping album data from nodata.tv and adding them to a Spotify playlist.

## Features

- Scrapes album/artist data with genre tags from nodata.tv blog pages
- **Automatically sorts albums into genre-specific playlists** based on tags
- Searches for albums on Spotify
- Retrieves all tracks from found albums
- Adds tracks to the appropriate genre playlist
- Handles rate limiting and errors gracefully
- **Tracks albums not found on Spotify** and saves them to a markdown file with clickable links
- Provides detailed statistics breakdown by genre

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

### 3. Configure Playlist IDs

The script uses multiple playlists for different genres. Add these to your `.env` file:

```bash
SPOTIFY_PLAYLIST_BASS=your_bass_playlist_id
SPOTIFY_PLAYLIST_TECHNO=your_techno_playlist_id
SPOTIFY_PLAYLIST_HOUSE=your_house_playlist_id
SPOTIFY_PLAYLIST_DNB=your_dnb_playlist_id
SPOTIFY_PLAYLIST_AMBIENT=your_ambient_playlist_id
SPOTIFY_PLAYLIST_REST=your_rest_playlist_id
```

**How to Get Playlist IDs:**
1. Open your Spotify playlist in a browser
2. Copy the playlist ID from the URL
   - Example URL: `https://open.spotify.com/playlist/6fSJPnnTX5jyAeA4Q8a0HD`
   - Playlist ID: `6fSJPnnTX5jyAeA4Q8a0HD`

**Genre Mappings:**
- **Bass** playlist: Albums tagged with Breaks, Dubstep, Bass, or Breakbeat
- **Techno** playlist: Albums tagged with Techno
- **House** playlist: Albums tagged with House
- **Drum'n'Bass** playlist: Albums tagged with Drum n Bass, Jungle, or Hardcore
- **Ambient** playlist: Albums tagged with Ambient
- **Rest** playlist: Albums without matching tags or unrecognized genres

### 4. Configure Script Settings (Optional)

Edit `index.js` if needed:
- `START_PAGE`: Starting page number (default: 1)
- `END_PAGE`: Ending page number (default: 26)

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
## Example Output

```
🎵 Starting NoData.tv to Spotify automation (Multi-Genre)
   Pages: 1 to 26
   Playlists configured:
     - Bass: 6fSJPnnTX5jyAeA4Q8a0HD
     - Techno: 7gTKqYjh8j93KLmNfS4bUZ
     - House: 8hULrZki9k04MLnOgT5cVA
     - Drum'n'Bass: 9iVMsAli0l15NMoPh26dWB
     - Ambient: 0jWNtBmj1m26ONqPi37eXC
     - Rest: 1kXOuCnk2n37POrQj48fYD

🔐 Starting authentication...
👉 Please open this URL in your browser:
   http://localhost:3000/login

✅ Authentication successful! Access token obtained.

� Fetching page 1: https://nodata.tv/blog/page/1
   Found 10 albums on page 1

[1] Processing: "Numbers Game EP" by DJ Aakmael [Breaks, Bass]
   → Destination: BASS playlist
   ✓ Found: "Numbers Game EP" by DJ Aakmael (ID: 4GVduvMZhj44TETvpGyf4r)
   ✓ Got 4 tracks from album
   ✓ Added 4 tracks to BASS playlist

[2] Processing: "Deep Space" by Ambient Artist [Ambient, Electronic]
   → Destination: AMBIENT playlist
   ✓ Found: "Deep Space" by Ambient Artist (ID: 5hWOdMxk5k06PMqSj59gZE)
   ✓ Got 8 tracks from album
   ✓ Added 8 tracks to AMBIENT playlist

...

======================================================================
🎉 Automation completed!
======================================================================
   Total albums processed: 260
   Total albums not found: 15
   Total tracks added: 2847

📊 Breakdown by genre:
   BASS       - Processed: 45, Added: 523 tracks, Not found: 3
   TECHNO     - Processed: 78, Added: 891 tracks, Not found: 5
   HOUSE      - Processed: 52, Added: 612 tracks, Not found: 2
   DNB        - Processed: 34, Added: 398 tracks, Not found: 1
   AMBIENT    - Processed: 29, Added: 301 tracks, Not found: 2
   REST       - Processed: 22, Added: 122 tracks, Not found: 2
======================================================================
```
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
- Albums grouped by genre/playlist
- Clickable links to each album's nodata.tv page
- Artist and album name with tags
- Total count of not found albums

Example format:
```markdown
# Albums Not Found on Spotify

Generated: 11/9/2025, 3:45:30 PM
Total: 8 albums

---

## AMBIENT (2 albums)

1. [Artist Name - Album Title](https://nodata.tv/blog/post-url) *[Ambient, Electronic]*
2. [Another Artist - Deep Space](https://nodata.tv/blog/other-url) *[Ambient]*

## BASS (3 albums)

1. [Bass Artist - Heavy EP](https://nodata.tv/blog/bass-url) *[Dubstep, Bass]*
2. [Break Artist - Breaks Album](https://nodata.tv/blog/breaks-url) *[Breaks]*

## TECHNO (3 albums)

1. [Techno Producer - Dark Tracks](https://nodata.tv/blog/techno-url) *[Techno]*
```

This makes it easy to manually check and potentially add these albums later, organized by genre.

## Notes

- The script adds tracks to the beginning of the playlist (position 0)
- Maximum 100 tracks can be added per request (handled automatically)
- Album matching uses Spotify's search with artist and album name
- Date markers like `[2024]` are automatically removed from scraped data
