import 'dotenv/config';
import axios from 'axios';
import * as cheerio from 'cheerio';
import express from 'express';
import querystring from 'querystring';
import { Buffer } from 'buffer';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'http://localhost:3000/callback';
const PLAYLIST_ID = process.env.SPOTIFY_PLAYLIST_ID || 'YOUR_PLAYLIST_ID';
const START_PAGE = 1;
const END_PAGE = 26;

// Token storage
let accessToken = null;
let refreshToken = null;
let tokenExpiryTime = null;

// Track not found albums
const notFoundAlbums = [];

// Delay helper to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
    const server = app.listen(3000, () => {
      console.log('🌐 Auth server listening on http://localhost:3000');
    });

    // Root endpoint - helpful message
    app.get('/', (req, res) => {
      res.send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>🎵 NoData Spotify Automation</h1>
            <p>To authenticate, please visit:</p>
            <p><a href="/login" style="font-size: 18px; color: #1DB954;">http://localhost:3000/login</a></p>
            <p style="margin-top: 30px; color: #666;">If you're seeing this page after clicking authorize on Spotify,<br>
            there may be an issue with your Redirect URI configuration.</p>
            <p style="color: #666;">Make sure your Spotify app has the redirect URI set to:<br>
            <code>http://localhost:3000/callback</code></p>
          </body>
        </html>
      `);
    });

    // Login endpoint
    app.get('/login', (req, res) => {
      const state = generateRandomString(16);
      const scope = 'playlist-modify-public playlist-modify-private';

      res.redirect('https://accounts.spotify.com/authorize?' +
        querystring.stringify({
          response_type: 'code',
          client_id: CLIENT_ID,
          scope: scope,
          redirect_uri: REDIRECT_URI,
          state: state
        }));
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
    console.log('   http://localhost:3000/login\n');
  });
}

// Fetch albums from a nodata.tv page
async function fetchAlbumsFromPage(pageNumber) {
  try {
    const url = `https://nodata.tv/blog/page/${pageNumber}`;
    console.log(`\n📄 Fetching page ${pageNumber}: ${url}`);
    
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    
    const albums = [];
    $('.column-13 .object > a').each((index, element) => {
      const text = $(element).text().replace(/\[....\]/g, '').split('/ ');
      const href = $(element).attr('href');
      if (text.length === 2) {
        albums.push({
          artist: text[0].trim(),
          album: text[1].trim(),
          url: href
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
async function searchSpotifyAlbum(artist, album, nodataUrl) {
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
      return albumId;
    } else {
      console.log(`   ✗ Not found: "${album}" by ${artist}`);
      // Track not found album
      notFoundAlbums.push({
        artist,
        album,
        url: nodataUrl
      });
      return null;
    }
  } catch (error) {
    if (error.response?.status === 401) {
      console.error('❌ Spotify token expired or invalid. Please update the token.');
      throw new Error('Invalid Spotify token');
    }
    console.error(`   ✗ Error searching for "${album}" by ${artist}:`, error.message);
    // Track error cases as not found too
    notFoundAlbums.push({
      artist,
      album,
      url: nodataUrl
    });
    return null;
  }
}

// Get all tracks from an album
async function getAlbumTracks(albumId) {
  try {
    const token = await getAccessToken();
    const url = `https://api.spotify.com/v1/albums/${albumId}/tracks`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const trackUris = response.data.items.map(item => item.uri);
    console.log(`   ✓ Got ${trackUris.length} tracks from album`);
    return trackUris;
  } catch (error) {
    console.error(`   ✗ Error getting tracks for album ${albumId}:`, error.message);
    return [];
  }
}

// Add tracks to Spotify playlist
async function addTracksToPlaylist(trackUris) {
  if (trackUris.length === 0) {
    return;
  }
  
  try {
    // Spotify API limits to 100 tracks per request
    const chunks = [];
    for (let i = 0; i < trackUris.length; i += 100) {
      chunks.push(trackUris.slice(i, i + 100));
    }
    
    for (const chunk of chunks) {
      const token = await getAccessToken();
      const url = `https://api.spotify.com/v1/playlists/${PLAYLIST_ID}/tracks`;
      
      await axios.post(url, {
        uris: chunk,
        position: 0
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`   ✓ Added ${chunk.length} tracks to playlist`);
      await delay(500); // Small delay between requests
    }
  } catch (error) {
    console.error(`   ✗ Error adding tracks to playlist:`, error.message);
  }
}

// Save not found albums to markdown file
function saveNotFoundAlbums() {
  if (notFoundAlbums.length === 0) {
    return;
  }

  const timestamp = new Date().toISOString().split('T')[0];
  const filename = `not-found-albums-${timestamp}.md`;
  const filepath = join(__dirname, filename);

  let content = `# Albums Not Found on Spotify\n\n`;
  content += `Generated: ${new Date().toLocaleString()}\n`;
  content += `Total: ${notFoundAlbums.length} albums\n\n`;
  content += `---\n\n`;

  notFoundAlbums.forEach((album, index) => {
    content += `${index + 1}. [${album.artist} - ${album.album}](${album.url})\n`;
  });

  try {
    writeFileSync(filepath, content, 'utf-8');
    console.log(`\n📝 Not found albums saved to: ${filename}`);
  } catch (error) {
    console.error(`❌ Error saving not found albums:`, error.message);
  }
}

// Main function
async function main() {
  console.log('🎵 Starting NoData.tv to Spotify automation');
  console.log(`   Pages: ${START_PAGE} to ${END_PAGE}`);
  console.log(`   Playlist ID: ${PLAYLIST_ID}\n`);
  
  // Authenticate first
  if (!accessToken) {
    await setupAuthServer();
  }
  
  let totalProcessed = 0;
  let totalAdded = 0;
  let totalNotFound = 0;
  
  // Iterate through pages
  for (let page = START_PAGE; page <= END_PAGE; page++) {
    const albums = await fetchAlbumsFromPage(page);
    
    // Process each album
    for (const { artist, album, url } of albums) {
      totalProcessed++;
      console.log(`\n[${totalProcessed}] Processing: "${album}" by ${artist}`);
      
      // Step 1: Search for album on Spotify
      const albumId = await searchSpotifyAlbum(artist, album, url);
      await delay(300); // Rate limiting delay
      
      if (!albumId) {
        totalNotFound++;
        continue;
      }
      
      // Step 2: Get all tracks from the album
      const trackUris = await getAlbumTracks(albumId);
      await delay(300); // Rate limiting delay
      
      if (trackUris.length === 0) {
        continue;
      }
      
      // Step 3: Add tracks to playlist
      await addTracksToPlaylist(trackUris);
      totalAdded += trackUris.length;
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
  console.log('\n' + '='.repeat(50));
  console.log('🎉 Automation completed!');
  console.log(`   Total albums processed: ${totalProcessed}`);
  console.log(`   Total albums not found: ${totalNotFound}`);
  console.log(`   Total tracks added to playlist: ${totalAdded}`);
  console.log('='.repeat(50));
}

// Run the script
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
