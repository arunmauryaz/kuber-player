# Kuber Player — Media Repository Folder

You can manually drop any video files (e.g., `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`) directly into this directory.

The Kuber backend mock server scans this directory on every refresh. When it detects a new video file, it will:
1. Automatically register it.
2. Generate its HLS streaming playlists, poster thumbnails, and sprites.
3. List it inside the developer sandbox dropdown for playback.

Any videos uploaded via the sandbox UI form will also be saved directly into this directory.
