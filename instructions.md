Entry point 
- change {page-number} to numbers from 1 to n
- token {token-here} -  BQC6bvmgY7x-agYqMp_PEIeog-7IQGoupeOQImG6J2KY872DPTfI-yT5Yvtdnti7fbPTUQ2Ib-UcNlThFB_GW1ycXij4dygdoBEQF5GRQ9oZTqS6OeIXQ7t1NFSJndDD88FZvpJSJbf0ezL-8oGrhrAH8I27-QuEn4fsAhswO-Z_jcrj5ek9C8n5KjJ_PsbgNNUcTOHiEoJrE8sViQ1MESJW7C2ZBlYRxdm-c678u_QGNE8s27ksnr3RtV88PKn850PK2mDudvQ8X3h9qOiujgBRqva2AoNodwGWS7vW82KH7Rftp6WSjVEM9heinVJahNCa8U5VRCB08O2m1JRZFiIVfD7sXRQ23PDVw1KOiqrmbHd2d5MQuXJ1OMAAQ_H-PjdN1EI


fetch https://nodata.tv/blog/page/{page-number}

query selector to get the list of all albums on a given page 

Array.from(document.querySelectorAll('.column-13 .object > a')).map(a => a.textContent.replace(/\[....\]/g, '').split('/ '))

Sample data:  Array of arrays, with 'artist name', fisrt then 'album name'
[
    [
        "DJ Aakmael ",
        "Numbers Game "
    ],
    [
        "Marshall Applewhite ",
        "We Dress For Dinner "
    ],
]


As of now we'll skip the token part, I'll just give you the Bearer as an entry point. For each array item we'll be executing:

1. search request:

curl --request GET \
  --url 'https://api.spotify.com/v1/search?q=artist%3ADJ+Aakmael+album%3ANumbers+Game&type=album' \
  --header 'Authorization: Bearer {token-here}'

see search-response.json for the response structure. We need to save albums.items[0].id (if it exists) 

2. next for album id we download all tracks 

curl --request GET \
  --url https://api.spotify.com/v1/albums/{id}/tracks \
  --header 'Authorization: Bearer {token-here}'

See tracks-response.json . To get all track uris:
items[index].uri 

3. Next with those uris we can add tracks to 6fSJPnnTX5jyAeA4Q8a0HD playlist, using comma separated uris:

curl --request POST \
  --url 'https://api.spotify.com/v1/playlists/6fSJPnnTX5jyAeA4Q8a0HD/tracks?uris=spotify%3Atrack%3A4iV5W9uYEdYUVa79Axb7Rh%2Cspotify%3Atrack%3A1301WleyT98MSxVHPZCA6M' \
  --header 'Authorization: Bearer {token}' \
  --header 'Content-Type: application/json' \
  --data '{
    "uris": [
        "string"
    ],
    "position": 0
}'

After iterating through all items (all items on a page + all pages initially asked for) finish the execution.