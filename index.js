import axios from 'axios';
import * as cheerio from 'cheerio';

// Configuration
const SPOTIFY_TOKEN = 'BQDNpZ5PIl9d70zBJQhnEGvJpdKOPc_E8Gk2eKzvEv8p3nUaWOAZvHIeLzsn_ouBO7hgWmS4P';
const PLAYLIST_ID = '6fSJPnnTX5jyAeA4Q8a0HD';
const START_PAGE = 1;
const END_PAGE = 5; // Change this to the number of pages you want to scrape

// Delay helper to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
      if (text.length === 2) {
        albums.push({
          artist: text[0].trim(),
          album: text[1].trim()
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
async function searchSpotifyAlbum(artist, album) {
  try {
    const query = `artist:${artist} album:${album}`;
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${SPOTIFY_TOKEN}`
      }
    });
    
    if (response.data.albums.items.length > 0) {
      const albumId = response.data.albums.items[0].id;
      console.log(`   ✓ Found: "${album}" by ${artist} (ID: ${albumId})`);
      return albumId;
    } else {
      console.log(`   ✗ Not found: "${album}" by ${artist}`);
      return null;
    }
  } catch (error) {
    if (error.response?.status === 401) {
      console.error('❌ Spotify token expired or invalid. Please update the token.');
      throw new Error('Invalid Spotify token');
    }
    console.error(`   ✗ Error searching for "${album}" by ${artist}:`, error.message);
    return null;
  }
}

// Get all tracks from an album
async function getAlbumTracks(albumId) {
  try {
    const url = `https://api.spotify.com/v1/albums/${albumId}/tracks`;
    
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${SPOTIFY_TOKEN}`
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
      const url = `https://api.spotify.com/v1/playlists/${PLAYLIST_ID}/tracks`;
      
      await axios.post(url, {
        uris: chunk,
        position: 0
      }, {
        headers: {
          'Authorization': `Bearer ${SPOTIFY_TOKEN}`,
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

// Main function
async function main() {
  console.log('🎵 Starting NoData.tv to Spotify automation');
  console.log(`   Pages: ${START_PAGE} to ${END_PAGE}`);
  console.log(`   Playlist ID: ${PLAYLIST_ID}\n`);
  
  let totalProcessed = 0;
  let totalAdded = 0;
  let totalNotFound = 0;
  
  // Iterate through pages
  for (let page = START_PAGE; page <= END_PAGE; page++) {
    const albums = await fetchAlbumsFromPage(page);
    
    // Process each album
    for (const { artist, album } of albums) {
      totalProcessed++;
      console.log(`\n[${totalProcessed}] Processing: "${album}" by ${artist}`);
      
      // Step 1: Search for album on Spotify
      const albumId = await searchSpotifyAlbum(artist, album);
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
