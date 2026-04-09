import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import express from 'express';
import https from 'https';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import querystring from 'querystring';
import { Buffer } from 'buffer';
// writeFileSync already imported above
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'https://127.0.0.1:3000/callback';
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || null;
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || null;
const SSL_PASSPHRASE = process.env.SSL_PASSPHRASE || undefined;
const START_PAGE = process.env.START_PAGE || 1;
const END_PAGE = process.env.END_PAGE || 316;
const NOT_FOUND_ALBUMS_FILE = process.env.NOT_FOUND_ALBUMS_FILE || 'not-found-albums.md';

// Playlist IDs by genre
const PLAYLISTS = {
  BASS: process.env.SPOTIFY_PLAYLIST_BASS || 'YOUR_BASS_PLAYLIST_ID',
  TECHNO: process.env.SPOTIFY_PLAYLIST_TECHNO || 'YOUR_TECHNO_PLAYLIST_ID',
  HOUSE: process.env.SPOTIFY_PLAYLIST_HOUSE || 'YOUR_HOUSE_PLAYLIST_ID',
  DNB: process.env.SPOTIFY_PLAYLIST_DNB || 'YOUR_DNB_PLAYLIST_ID',
  AMBIENT: process.env.SPOTIFY_PLAYLIST_AMBIENT || 'YOUR_AMBIENT_PLAYLIST_ID',
  REST: process.env.SPOTIFY_PLAYLIST_REST || 'YOUR_REST_PLAYLIST_ID'
};

// Genre tag mappings
const GENRE_MAPPINGS = {
  BASS: ['Breaks', 'Dubstep', 'Bass'],
  TECHNO: ['Techno'],
  HOUSE: ['House'],
  DNB: ['Drum n Bass', 'Jungle', 'Hardcore'],
  AMBIENT: ['Ambient']
};

// Token storage
let accessToken = null;
let refreshToken = null;
let tokenExpiryTime = null;

// Track not found albums in a deduplicated way across the current run
const notFoundAlbums = new Map();
let notFoundAlbumSeq = 0;

// Track stats by genre
const genreStats = {
  BASS: { processed: 0, added: 0, notFound: 0, skipped: 0 },
  TECHNO: { processed: 0, added: 0, notFound: 0, skipped: 0 },
  HOUSE: { processed: 0, added: 0, notFound: 0, skipped: 0 },
  DNB: { processed: 0, added: 0, notFound: 0, skipped: 0 },
  AMBIENT: { processed: 0, added: 0, notFound: 0, skipped: 0 },
  REST: { processed: 0, added: 0, notFound: 0, skipped: 0 }
};

// Store existing track URIs for each playlist
const existingPlaylistTracks = {
  BASS: new Set(),
  TECHNO: new Set(),
  HOUSE: new Set(),
  DNB: new Set(),
  AMBIENT: new Set(),
  REST: new Set()
};

// Delay helper to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeAlbumField(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getNotFoundAlbumKey({ artist, album, url }) {
  return [
    normalizeAlbumField(artist),
    normalizeAlbumField(album),
    normalizeAlbumField(url)
  ].join('::');
}

function addNotFoundAlbum(entry) {
  const key = getNotFoundAlbumKey(entry);
  const existing = notFoundAlbums.get(key);

  if (existing) {
    const mergedTags = Array.from(new Set([...(existing.tags || []), ...(entry.tags || [])])).sort();
    notFoundAlbums.set(key, {
      ...existing,
      ...entry,
      tags: mergedTags,
      playlist: existing.playlist || entry.playlist,
      publishDate: existing.publishDate || entry.publishDate,
      _seq: existing._seq
    });
    return false;
  }

  notFoundAlbums.set(key, {
    ...entry,
    tags: Array.from(new Set(entry.tags || [])).sort(),
    _seq: ++notFoundAlbumSeq
  });
  return true;
}

function parseNodataPublishDate(text) {
  if (!text) return null;
  const cleaned = String(text).split('·')[0].trim();
  const match = cleaned.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) return null;

  const [, mon, dayStr, yearStr] = match;
  const monthIndex = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
  }[mon];
  if (monthIndex === undefined) return null;

  const year = Number(yearStr);
  const day = Number(dayStr);
  const date = new Date(Date.UTC(year, monthIndex, day));

  // Format as YYYY-MM-DD (UTC) for easy lexicographic sorting.
  return date.toISOString().slice(0, 10);
}

// Generate random string for state parameter
function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// Check if token is expired
function isTokenExpired() {
  if (!tokenExpiryTime) return true;
  return Date.now() >= tokenExpiryTime;
}

// Get access token (refresh if needed)
async function getAccessToken() {
  if (accessToken && !isTokenExpired()) {
    return accessToken;
  }
  
  if (refreshToken) {
    console.log('🔄 Refreshing access token...');
    await refreshAccessToken();
    return accessToken;
  }
  
  throw new Error('No valid access token. Please authenticate first.');
}

// Refresh access token
async function refreshAccessToken() {
  try {
    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
      },
      data: querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }),
      method: 'post'
    };

    const response = await axios(authOptions);
    accessToken = response.data.access_token;
    tokenExpiryTime = Date.now() + (response.data.expires_in * 1000);
    console.log('✅ Access token refreshed successfully');
  } catch (error) {
    console.error('❌ Error refreshing token:', error.message);
    throw error;
  }
}

// Setup Express server for OAuth flow
function setupAuthServer() {
  return new Promise((resolve, reject) => {
    const app = express();
    let server;

    // Prepare HTTPS options
    try {
      if (!SSL_KEY_PATH || !SSL_CERT_PATH) {
        throw new Error('Missing SSL key/cert. Set SSL_KEY_PATH and SSL_CERT_PATH env variables.');
      }

      const httpsOptions = {
        key: readFileSync(SSL_KEY_PATH),
        cert: readFileSync(SSL_CERT_PATH),
        passphrase: SSL_PASSPHRASE
      };

      server = https.createServer(httpsOptions, app).listen(3000, () => {
        console.log('🌐 Auth server listening on https://127.0.0.1:3000');
      });
    } catch (e) {
      console.error('❌ HTTPS setup error:', e.message);
      console.error('👉 Provide valid SSL cert/key via env: SSL_KEY_PATH, SSL_CERT_PATH.');
      return reject(e);
    }

    // Root endpoint - helpful message
    app.get('/', (req, res) => {
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>🎵 NoData Spotify Automation</h1>
            <p>To authenticate, please visit:</p>
            <p><a href="/login" style="font-size: 18px; color: #1DB954;">https://127.0.0.1:3000/login</a></p>
            <p style="margin-top: 30px; color: #666;">If you're seeing this page after clicking authorize on Spotify,<br>
            there may be an issue with your Redirect URI configuration.</p>
            <p style="color: #666;">Make sure your Spotify app has the redirect URI set to:<br>
            <code>https://127.0.0.1:3000/callback</code></p>
          </body>
        </html>
      `);
    });

    // Login endpoint
    app.get('/login', (req, res) => {
      const state = generateRandomString(16);
      const scope = 'playlist-modify-public playlist-modify-private';

      const authorizeUrl = 'https://accounts.spotify.com/authorize?' +
        querystring.stringify({
          response_type: 'code',
          client_id: CLIENT_ID,
          scope: scope,
          redirect_uri: REDIRECT_URI,
          state: state
        });

      console.log('\n🔎 Using redirect URI:', REDIRECT_URI);
      console.log('🔗 Full authorize URL (for debugging):');
      console.log('   ' + authorizeUrl + '\n');

      res.redirect(authorizeUrl);
    });

    // Callback endpoint
    app.get('/callback', async (req, res) => {
      const code = req.query.code || null;
      const state = req.query.state || null;

      if (state === null) {
        res.redirect('/#' +
          querystring.stringify({
            error: 'state_mismatch'
          }));
        return;
      }

      try {
        const authOptions = {
          url: 'https://accounts.spotify.com/api/token',
          data: querystring.stringify({
            code: code,
            redirect_uri: REDIRECT_URI,
            grant_type: 'authorization_code'
          }),
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
          },
          method: 'post'
        };

        const response = await axios(authOptions);
        accessToken = response.data.access_token;
        refreshToken = response.data.refresh_token;
        tokenExpiryTime = Date.now() + (response.data.expires_in * 1000);

        res.send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #1DB954;">✅ Authentication Successful!</h1>
              <p>You can close this window and return to the terminal.</p>
            </body>
          </html>
        `);

        console.log('\n✅ Authentication successful! Access token obtained.');
        
        // Close server and resolve promise
        setTimeout(() => {
          server.close();
          resolve();
        }, 1000);

      } catch (error) {
        console.error('❌ Error getting token:', error.message);
        res.send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #ff0000;">❌ Authentication Failed</h1>
              <p>${error.message}</p>
            </body>
          </html>
        `);
        server.close();
        reject(error);
      }
    });

    // Start auth flow
    console.log('\n🔐 Starting authentication...');
    console.log('👉 Please open this URL in your browser:');
    console.log('   https://127.0.0.1:3000/login\n');
    console.log('ℹ️ Expecting callback at:', REDIRECT_URI);
  });
}

// Fetch all existing tracks from a playlist
async function fetchPlaylistTracks(playlistId, playlistName) {
  try {
    const token = await getAccessToken();
    const allTracks = new Set();
    let offset = 0;
    const limit = 100;
    let total = 0;
    
    console.log(`   Fetching existing tracks from ${playlistName} playlist...`);
    
    do {
      const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?offset=${offset}&limit=${limit}&fields=items(track(uri)),total`;
      
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      total = response.data.total;
      
      response.data.items.forEach(item => {
        if (item.track && item.track.uri) {
          allTracks.add(item.track.uri);
        }
      });
      
      offset += limit;
      await delay(200); // Rate limiting delay
      
    } while (offset < total);
    
    console.log(`   ✓ Found ${allTracks.size} existing tracks in ${playlistName}`);
    return allTracks;
    
  } catch (error) {
    console.error(`   ✗ Error fetching tracks from ${playlistName}:`, error.message);
    return new Set();
  }
}

// Fetch all existing tracks from all playlists
async function fetchAllPlaylistTracks() {
  console.log('\n🔍 Fetching existing tracks from all playlists...');
  
  for (const [genre, playlistId] of Object.entries(PLAYLISTS)) {
    if (playlistId && !playlistId.startsWith('YOUR_')) {
      const tracks = await fetchPlaylistTracks(playlistId, genre);
      existingPlaylistTracks[genre] = tracks;
    }
  }
  
  console.log('✅ Finished fetching existing tracks\n');
}

// Determine playlist based on tags
function determinePlaylist(tags) {
  if (!tags || tags.length === 0) {
    return 'REST';
  }

  const tagsLower = tags.map(tag => tag.toLowerCase().trim());
  
  // Priority 1: DNB - if ANY DNB tag is present, it takes priority
  if (GENRE_MAPPINGS.DNB.some(keyword => 
    tagsLower.some(tag => tag === keyword.toLowerCase())
  )) {
    return 'DNB';
  }
  
  // Priority 2: Check Techno, House, Bass in order
  for (const genre of ['BASS', 'HOUSE', 'TECHNO']) {
    if (GENRE_MAPPINGS[genre].some(keyword => 
      tagsLower.some(tag => tag === keyword.toLowerCase())
    )) {
      return genre;
    }
  }
  
  // Priority 3: Ambient - only if no other main genres are present
  if (GENRE_MAPPINGS.AMBIENT.some(keyword => 
    tagsLower.some(tag => tag === keyword.toLowerCase())
  )) {
    return 'AMBIENT';
  }

  return 'REST';
}

// Fetch albums from a nodata.tv page
async function fetchAlbumsFromPage(pageNumber) {
  try {
    const url = `https://nodata.tv/blog/page/${pageNumber}`;
    console.log(`\n📄 Fetching page ${pageNumber}: ${url}`);
    
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    const albums = [];
    $('.project-box .object').each((index, element) => {
      // Get album info from nested anchor
      const albumLink = $(element).find('> a').first();
      const text = albumLink.text().replace(/\[....\]/g, '').split('/ ');
      const href = albumLink.attr('href');

      // Example: "Apr 07, 2026 · 1 comment"
      const publishDate = parseNodataPublishDate($(element).find('p').last().text());
      
      // Get tags
      const tags = [];
      $(element).find('a[rel="category tag"]').each((i, tagEl) => {
        tags.push($(tagEl).text().trim());
      });
      
      if (text.length === 2) {
        const playlist = determinePlaylist(tags);
        albums.push({
          artist: text[0].trim(),
          album: text[1].trim(),
          url: href,
          tags: tags,
          playlist: playlist,
          publishDate
        });
      }
    });
    
    console.log(`   Found ${albums.length} albums on page ${pageNumber}`);
    return albums;
  } catch (error) {
    console.error(`❌ Error fetching page ${pageNumber}:`, error.message);
    return [];
  }
}

// Search for album on Spotify
async function searchSpotifyAlbum(artist, album, nodataUrl, tags, playlist, publishDate) {
  try {
    const token = await getAccessToken();
    const query = `artist:${artist} album:${album}`;
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.data.albums.items.length > 0) {
      const albumId = response.data.albums.items[0].id;
      console.log(`   ✓ Found: "${album}" by ${artist} (ID: ${albumId})`);
      return { albumId, wasNewNotFound: false };
    } else {
      console.log(`   ✗ Not found: "${album}" by ${artist}`);
      // Track not found album
      const wasNewNotFound = addNotFoundAlbum({
        artist,
        album,
        url: nodataUrl,
        tags,
        playlist,
        publishDate
      });
      return { albumId: null, wasNewNotFound };
    }
  } catch (error) {
    if (error.response?.status === 401) {
      console.error('❌ Spotify token expired or invalid. Please update the token.');
      throw new Error('Invalid Spotify token');
    }
    console.error(`   ✗ Error searching for "${album}" by ${artist}:`, error.message);
    // Track error cases as not found too
    const wasNewNotFound = addNotFoundAlbum({
      artist,
      album,
      url: nodataUrl,
      tags,
      playlist,
      publishDate
    });
    return { albumId: null, wasNewNotFound };
  }
}

// Get all tracks from an album
async function getAlbumTracks(albumId, playlistGenre) {
  try {
    const token = await getAccessToken();
    const url = `https://api.spotify.com/v1/albums/${albumId}/tracks`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const allTrackUris = response.data.items.map(item => item.uri);
    
    // Filter out tracks that already exist in the playlist
    const existingTracks = existingPlaylistTracks[playlistGenre];
    const newTrackUris = allTrackUris.filter(uri => !existingTracks.has(uri));
    
    if (newTrackUris.length < allTrackUris.length) {
      const skippedCount = allTrackUris.length - newTrackUris.length;
      console.log(`   ✓ Got ${allTrackUris.length} tracks from album (${skippedCount} already in playlist, ${newTrackUris.length} new)`);
    } else {
      console.log(`   ✓ Got ${newTrackUris.length} tracks from album (all new)`);
    }
    
    return { allTracks: allTrackUris, newTracks: newTrackUris };
  } catch (error) {
    console.error(`   ✗ Error getting tracks for album ${albumId}:`, error.message);
    return { allTracks: [], newTracks: [] };
  }
}

// Add tracks to Spotify playlist
async function addTracksToPlaylist(trackUris, playlistId, playlistName) {
  if (trackUris.length === 0) {
    return 0;
  }
  
  try {
    // Spotify API limits to 100 tracks per request
    const chunks = [];
    for (let i = 0; i < trackUris.length; i += 100) {
      chunks.push(trackUris.slice(i, i + 100));
    }
    
    for (const chunk of chunks) {
      const token = await getAccessToken();
      const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks`;
      
      await axios.post(url, {
        uris: chunk,
        position: 0
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      // Add to our tracking set
      chunk.forEach(uri => existingPlaylistTracks[playlistName].add(uri));
      
      console.log(`   ✓ Added ${chunk.length} tracks to ${playlistName} playlist`);
      await delay(500); // Small delay between requests
    }
    
    return trackUris.length;
  } catch (error) {
    console.error(`   ✗ Error adding tracks to ${playlistName} playlist:`, error.message);
    return 0;
  }
}

// Save not found albums to markdown file
function saveNotFoundAlbums() {
  if (notFoundAlbums.size === 0) {
    return;
  }

  const filename = NOT_FOUND_ALBUMS_FILE;
  const filepath = join(__dirname, filename);
  const dedupedAlbums = Array.from(notFoundAlbums.values()).sort((a, b) => {
    const playlistCompare = a.playlist.localeCompare(b.playlist);
    if (playlistCompare !== 0) return playlistCompare;

    // Newest first within each playlist.
    const dateA = a.publishDate || '';
    const dateB = b.publishDate || '';
    if (dateA !== dateB) return dateB.localeCompare(dateA);

    return (a._seq || 0) - (b._seq || 0);
  });

  let content = `# Albums Not Found on Spotify\n\n`;
  content += `Generated: ${new Date().toLocaleString()}\n`;
  content += `Total: ${dedupedAlbums.length} albums\n\n`;
  content += `---\n\n`;

  // Group by playlist
  const byPlaylist = {};
  dedupedAlbums.forEach(album => {
    if (!byPlaylist[album.playlist]) {
      byPlaylist[album.playlist] = [];
    }
    byPlaylist[album.playlist].push(album);
  });

  // Output by genre
  for (const [playlist, albums] of Object.entries(byPlaylist).sort()) {
    content += `## ${playlist} (${albums.length} albums)\n\n`;
    albums.forEach((album, index) => {
      const tagsStr = album.tags && album.tags.length > 0 ? ` *[${album.tags.join(', ')}]*` : '';
      const dateStr = album.publishDate ? `${album.publishDate} - ` : '';
      content += `${index + 1}. ${dateStr}[${album.artist} - ${album.album}](${album.url})${tagsStr}\n`;
    });
    content += `\n`;
  }

  try {
    writeFileSync(filepath, content, 'utf-8');
    console.log(`\n📝 Not found albums saved to: ${filename}`);
  } catch (error) {
    console.error(`❌ Error saving not found albums:`, error.message);
  }
}

function loadExistingNotFoundAlbums(filepath) {
  if (!existsSync(filepath)) {
    return;
  }

  try {
    const content = readFileSync(filepath, 'utf-8');
    let currentPlaylist = null;

    for (const line of content.split('\n')) {
      const playlistMatch = line.match(/^##\s+(.+?)\s+\(\d+\s+albums?\)$/);
      if (playlistMatch) {
        currentPlaylist = playlistMatch[1].trim();
        continue;
      }

      const albumMatch = line.match(/^\d+\.\s+(?:(\d{4}-\d{2}-\d{2})\s+-\s+)?\[(.+?)\s+-\s+(.+?)\]\((.+?)\)(?:\s+\*\[(.+)\]\*)?$/);
      if (!albumMatch || !currentPlaylist) {
        continue;
      }

      const [, publishDate, artist, album, url, tagsString] = albumMatch;
      const tags = tagsString ? tagsString.split(',').map(tag => tag.trim()).filter(Boolean) : [];

      addNotFoundAlbum({
        artist,
        album,
        url,
        tags,
        playlist: currentPlaylist,
        publishDate: publishDate || null
      });
    }
  } catch (error) {
    console.error(`❌ Error loading existing not found albums:`, error.message);
  }
}

// Main function
async function main() {
  console.log('🎵 Starting NoData.tv to Spotify automation (Multi-Genre)');
  console.log(`   Pages: ${START_PAGE} to ${END_PAGE}`);
  console.log(`   Playlists configured:`);
  console.log(`     - Bass: ${PLAYLISTS.BASS}`);
  console.log(`     - Techno: ${PLAYLISTS.TECHNO}`);
  console.log(`     - House: ${PLAYLISTS.HOUSE}`);
  console.log(`     - Drum'n'Bass: ${PLAYLISTS.DNB}`);
  console.log(`     - Ambient: ${PLAYLISTS.AMBIENT}`);
  console.log(`     - Rest: ${PLAYLISTS.REST}\n`);
  
  // Authenticate first
  if (!accessToken) {
    await setupAuthServer();
  }

  loadExistingNotFoundAlbums(join(__dirname, NOT_FOUND_ALBUMS_FILE));
  
  // Fetch existing tracks from all playlists
  await fetchAllPlaylistTracks();
  
  let totalProcessed = 0;
  let totalAdded = 0;
  let totalNotFound = 0;
  let totalSkipped = 0;
  
  // Iterate through pages in reverse order
  for (let page = END_PAGE; page >= START_PAGE; page--) {
    const albums = await fetchAlbumsFromPage(page);
    
    // Process each album in reverse order
    for (const { artist, album, url, tags, playlist, publishDate } of albums.reverse()) {
      totalProcessed++;
      genreStats[playlist].processed++;
      
      const tagsStr = tags.length > 0 ? ` [${tags.join(', ')}]` : ' [no tags]';
      const dateStr = publishDate ? ` (${publishDate})` : '';
      console.log(`\n[${totalProcessed}] Processing: "${album}" by ${artist}${dateStr}${tagsStr}`);
      console.log(`   → Destination: ${playlist} playlist`);
      
      // Step 1: Search for album on Spotify
      const { albumId, wasNewNotFound } = await searchSpotifyAlbum(artist, album, url, tags, playlist, publishDate);
      await delay(300); // Rate limiting delay
      
      if (!albumId) {
        if (wasNewNotFound) {
          totalNotFound++;
          genreStats[playlist].notFound++;
        }
        continue;
      }
      
      // Step 2: Get all tracks from the album
      const { allTracks, newTracks } = await getAlbumTracks(albumId, playlist);
      await delay(300); // Rate limiting delay
      
      const skippedCount = allTracks.length - newTracks.length;
      if (skippedCount > 0) {
        totalSkipped += skippedCount;
        genreStats[playlist].skipped += skippedCount;
      }
      
      if (newTracks.length === 0) {
        console.log(`   ⊘ All tracks already in playlist, skipping`);
        continue;
      }
      
      // Step 3: Add tracks to the appropriate playlist
      const playlistId = PLAYLISTS[playlist];
      const addedCount = await addTracksToPlaylist(newTracks, playlistId, playlist);
      totalAdded += addedCount;
      genreStats[playlist].added += addedCount;
      await delay(500); // Rate limiting delay
    }
    
    console.log(`\n✅ Completed page ${page}`);
    await delay(1000); // Delay between pages
  }
  
  // Save not found albums to file
  if (totalNotFound > 0) {
    saveNotFoundAlbums();
  }
  
  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('🎉 Automation completed!');
  console.log('='.repeat(70));
  console.log(`   Total albums processed: ${totalProcessed}`);
  console.log(`   Total albums not found: ${totalNotFound}`);
  console.log(`   Total tracks added: ${totalAdded}`);
  console.log(`   Total tracks skipped (duplicates): ${totalSkipped}`);
  console.log('\n📊 Breakdown by genre:');
  for (const [genre, stats] of Object.entries(genreStats)) {
    if (stats.processed > 0) {
      console.log(`   ${genre.padEnd(10)} - Processed: ${stats.processed}, Added: ${stats.added} tracks, Skipped: ${stats.skipped}, Not found: ${stats.notFound}`);
    }
  }
  console.log('='.repeat(70));
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
