use crate::domain::video::{Video, VideoStatus, Chapter};
use crate::infrastructure::storage::StorageManager;
use tokio::process::Command;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::fs;
use std::io::Write;

#[derive(Debug, Clone, Deserialize)]
struct ProbeOutput {
    streams: Vec<ProbeStream>,
    format: ProbeFormat,
}

#[derive(Debug, Clone, Deserialize)]
struct ProbeStream {
    width: Option<i32>,
    height: Option<i32>,
    codec_name: Option<String>,
    bit_rate: Option<String>,
    r_frame_rate: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ProbeFormat {
    duration: Option<String>,
    size: Option<String>,
}

#[axum::async_trait]
pub trait VideoTranscoder: Send + Sync {
    async fn probe(&self, input_path: &Path) -> Result<VideoMetadata, String>;
    async fn transcode(
        &self,
        video_id: &str,
        input_path: &Path,
        metadata: &VideoMetadata,
    ) -> Result<TranscodeOutput, String>;
}

#[derive(Debug, Clone)]
pub struct VideoMetadata {
    pub duration: f64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub bitrate: Option<i64>,
    pub codec: Option<String>,
    pub size: i64,
}

#[derive(Debug, Clone)]
pub struct TranscodeOutput {
    pub playlist_path: PathBuf,
    pub thumbnail_path: PathBuf,
    pub sprite_vtt_path: PathBuf,
    pub is_mock: bool,
}

pub struct FfmpegTranscoder {
    ffmpeg_path: String,
    ffprobe_path: String,
    storage: StorageManager,
}

impl FfmpegTranscoder {
    pub fn new(ffmpeg_path: &str, ffprobe_path: &str, storage: StorageManager) -> Self {
        Self {
            ffmpeg_path: ffmpeg_path.to_string(),
            ffprobe_path: ffprobe_path.to_string(),
            storage,
        }
    }

    async fn check_ffmpeg_available(&self) -> bool {
        let ffmpeg_ok = Command::new(&self.ffmpeg_path)
            .arg("-version")
            .output()
            .await
            .is_ok();
        let ffprobe_ok = Command::new(&self.ffprobe_path)
            .arg("-version")
            .output()
            .await
            .is_ok();
        ffmpeg_ok && ffprobe_ok
    }
}

#[axum::async_trait]
impl VideoTranscoder for FfmpegTranscoder {
    async fn probe(&self, input_path: &Path) -> Result<VideoMetadata, String> {
        if !self.check_ffmpeg_available().await {
            // Fall back to Mock Metadata if FFmpeg/FFprobe are missing
            let file_size = fs::metadata(input_path).map(|m| m.len()).unwrap_or(1024 * 1024 * 5);
            return Ok(VideoMetadata {
                duration: 60.0, // mock duration
                width: Some(1920),
                height: Some(1080),
                bitrate: Some(5000000),
                codec: Some("h264".to_string()),
                size: file_size as i64,
            });
        }

        let output = Command::new(&self.ffprobe_path)
            .args(&[
                "-v", "error",
                "-show_entries", "stream=width,height,codec_name,bit_rate,r_frame_rate",
                "-show_entries", "format=duration,size",
                "-of", "json",
                input_path.to_str().ok_or("Invalid input path")?
            ])
            .output()
            .await
            .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("ffprobe failed: {}", err));
        }

        let parsed: ProbeOutput = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Failed to parse ffprobe JSON: {}", e))?;

        let video_stream = parsed.streams.iter().find(|s| s.width.is_some());
        let duration = parsed.format.duration
            .as_ref()
            .and_then(|d| d.parse::<f64>().ok())
            .unwrap_or(0.0);
        let size = parsed.format.size
            .as_ref()
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(0);

        Ok(VideoMetadata {
            duration,
            width: video_stream.and_then(|s| s.width),
            height: video_stream.and_then(|s| s.height),
            bitrate: video_stream.and_then(|s| s.bit_rate.as_ref().and_then(|b| b.parse::<i64>().ok())),
            codec: video_stream.and_then(|s| s.codec_name.clone()),
            size,
        })
    }

    async fn transcode(
        &self,
        video_id: &str,
        input_path: &Path,
        metadata: &VideoMetadata,
    ) -> Result<TranscodeOutput, String> {
        let stream_dir = self.storage.get_video_stream_dir(video_id);
        fs::create_dir_all(&stream_dir).map_err(|e| format!("Failed to create stream dir: {}", e))?;

        // Fall back to Mock Transcoder if FFmpeg is not installed
        if !self.check_ffmpeg_available().await {
            let mock = MockTranscoder::new(self.storage.clone());
            return mock.transcode(video_id, input_path, metadata).await;
        }

        let thumbnail_path = stream_dir.join("poster.jpg");
        let sprite_vtt_path = stream_dir.join("sprite.vtt");

        // 1. Generate Poster (Thumbnail) at 10% or 2s
        let poster_time = (metadata.duration * 0.1).min(10.0).to_string();
        let poster_status = Command::new(&self.ffmpeg_path)
            .args(&[
                "-ss", &poster_time,
                "-i", input_path.to_str().unwrap(),
                "-vframes", "1",
                "-q:v", "2",
                "-vf", "scale=1280:-1",
                "-y",
                thumbnail_path.to_str().unwrap(),
            ])
            .status()
            .await
            .map_err(|e| format!("Failed to execute poster extraction: {}", e))?;

        if !poster_status.success() {
            return Err("Failed to generate poster thumbnail via FFmpeg".to_string());
        }

        // 2. Generate Sprite sheets and WebVTT descriptor
        let sprite_img_pattern = stream_dir.join("sprite_%03d.jpg");
        let sprite_status = Command::new(&self.ffmpeg_path)
            .args(&[
                "-i", input_path.to_str().unwrap(),
                "-vf", "fps=1/5,scale=160:90,tile=10x10",
                "-y",
                sprite_img_pattern.to_str().unwrap(),
            ])
            .status()
            .await
            .map_err(|e| format!("Failed to run sprite generation: {}", e))?;

        if sprite_status.success() {
            // Write WebVTT descriptor
            let mut vtt_file = fs::File::create(&sprite_vtt_path)
                .map_err(|e| format!("Failed to create sprite VTT file: {}", e))?;
            
            writeln!(vtt_file, "WEBVTT\n").unwrap();
            
            let interval = 5;
            let total_previews = (metadata.duration / interval as f64).ceil() as i32;
            for i in 0..total_previews {
                let start_sec = i * interval;
                let end_sec = (i + 1) * interval;
                
                let start_h = start_sec / 3600;
                let start_m = (start_sec % 3600) / 60;
                let start_s = start_sec % 60;

                let end_h = end_sec / 3600;
                let end_m = (end_sec % 3600) / 60;
                let end_s = end_sec % 60;

                let sheet_idx = (i / 100) + 1;
                let tile_idx = i % 100;
                let col = tile_idx % 10;
                let row = tile_idx / 10;
                let x = col * 160;
                let y = row * 90;

                writeln!(
                    vtt_file,
                    "{:02}:{:02}:{:02}.000 --> {:02}:{:02}:{:02}.000\nsprite_{:03}.jpg#xywh={},{},160,90\n",
                    start_h, start_m, start_s,
                    end_h, end_m, end_s,
                    sheet_idx, x, y
                ).unwrap();
            }
        }

        // 3. HLS Multiresolution encoding
        // Determine resolution variant
        let height = metadata.height.unwrap_or(720);
        let mut filter_complex = String::new();
        let mut map_args = Vec::new();
        let mut var_stream_map = String::new();

        if height >= 1080 {
            filter_complex.push_str("[0:v]split=3[v1,v2,v3];[v1]scale=-2:1080[v1out];[v2]scale=-2:720[v2out];[v3]scale=-2:480[v3out]");
            map_args.extend_from_slice(&[
                "-map", "[v1out]", "-c:v:0", "libx264", "-b:v:0", "4500k", "-maxrate:v:0", "4800k", "-bufsize:v:0", "6000k",
                "-map", "[v2out]", "-c:v:1", "libx264", "-b:v:1", "2500k", "-maxrate:v:1", "2700k", "-bufsize:v:1", "3500k",
                "-map", "[v3out]", "-c:v:2", "libx264", "-b:v:2", "1000k", "-maxrate:v:2", "1100k", "-bufsize:v:2", "1500k",
            ]);
            var_stream_map.push_str("v:0,a:0 v:1,a:0 v:2,a:0");
        } else if height >= 720 {
            filter_complex.push_str("[0:v]split=2[v1,v2];[v1]scale=-2:720[v1out];[v2]scale=-2:480[v2out]");
            map_args.extend_from_slice(&[
                "-map", "[v1out]", "-c:v:0", "libx264", "-b:v:0", "2500k", "-maxrate:v:0", "2700k", "-bufsize:v:0", "3500k",
                "-map", "[v2out]", "-c:v:1", "libx264", "-b:v:1", "1000k", "-maxrate:v:1", "1100k", "-bufsize:v:1", "1500k",
            ]);
            var_stream_map.push_str("v:0,a:0 v:1,a:0");
        } else {
            filter_complex.push_str("[0:v]scale=-2:480[v1out]");
            map_args.extend_from_slice(&[
                "-map", "[v1out]", "-c:v:0", "libx264", "-b:v:0", "1000k", "-maxrate:v:0", "1100k", "-bufsize:v:0", "1500k",
            ]);
            var_stream_map.push_str("v:0,a:0");
        }

        // Add audio arguments if present, else run without audio mapping
        let has_audio = metadata.codec.as_ref().map(|c| c.contains("aac") || c.contains("mp3") || c.contains("vorbis")).unwrap_or(true);
        let mut final_args = vec![
            "-i".to_string(),
            input_path.to_str().unwrap().to_string(),
            "-filter_complex".to_string(),
            filter_complex,
        ];

        for arg in map_args {
            final_args.push(arg.to_string());
        }

        if has_audio {
            final_args.extend_from_slice(&[
                "-map", "a:0",
                "-c:a:0", "aac", "-b:a:0", "128k",
            ]);
        }

        let playlist_name = "master.m3u8";
        let segment_filename = "stream_%v_segment_%03d.ts";
        let subplaylist_filename = "stream_%v.m3u8";

        final_args.extend_from_slice(&[
            "-f", "hls",
            "-hls_time", "6",
            "-hls_playlist_type", "vod",
            "-master_pl_name", playlist_name,
            "-var_stream_map", &var_stream_map,
            "-hls_segment_filename", stream_dir.join(segment_filename).to_str().unwrap(),
            stream_dir.join(subplaylist_filename).to_str().unwrap(),
        ]);

        let hls_status = Command::new(&self.ffmpeg_path)
            .args(&final_args)
            .status()
            .await
            .map_err(|e| format!("Failed to run HLS packaging: {}", e))?;

        if !hls_status.success() {
            return Err("FFmpeg HLS packaging failed".to_string());
        }

        Ok(TranscodeOutput {
            playlist_path: stream_dir.join(playlist_name),
            thumbnail_path,
            sprite_vtt_path,
            is_mock: false,
        })
    }
}

pub struct MockTranscoder {
    storage: StorageManager,
}

impl MockTranscoder {
    pub fn new(storage: StorageManager) -> Self {
        Self { storage }
    }
}

#[axum::async_trait]
impl VideoTranscoder for MockTranscoder {
    async fn probe(&self, _input_path: &Path) -> Result<VideoMetadata, String> {
        Ok(VideoMetadata {
            duration: 120.0,
            width: Some(1280),
            height: Some(720),
            bitrate: Some(2500000),
            codec: Some("h264/aac".to_string()),
            size: 1024 * 1024 * 10,
        })
    }

    async fn transcode(
        &self,
        video_id: &str,
        _input_path: &Path,
        _metadata: &VideoMetadata,
    ) -> Result<TranscodeOutput, String> {
        let stream_dir = self.storage.get_video_stream_dir(video_id);
        fs::create_dir_all(&stream_dir).map_err(|e| format!("Failed to create stream dir: {}", e))?;

        // 1. Write a Master Playlist
        let master_content = "\
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
stream_720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480
stream_480p.m3u8
";
        fs::write(stream_dir.join("master.m3u8"), master_content)
            .map_err(|e| format!("Failed to write master playlist: {}", e))?;

        // 2. Write 720p playlist (which lists 10-second segments, 12 segments total for 120s duration)
        let mut playlist_720p = String::from("\
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
");
        for i in 0..12 {
            playlist_720p.push_str(&format!("#EXTINF:10.0,\nsegment_720p_{:03}.ts\n", i));
        }
        playlist_720p.push_str("#EXT-X-ENDLIST\n");
        fs::write(stream_dir.join("stream_720p.m3u8"), playlist_720p)
            .map_err(|e| format!("Failed to write 720p playlist: {}", e))?;

        // 3. Write 480p playlist
        let mut playlist_480p = String::from("\
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-PLAYLIST-TYPE:VOD
");
        for i in 0..12 {
            playlist_480p.push_str(&format!("#EXTINF:10.0,\nsegment_480p_{:03}.ts\n", i));
        }
        playlist_480p.push_str("#EXT-X-ENDLIST\n");
        fs::write(stream_dir.join("stream_480p.m3u8"), playlist_480p)
            .map_err(|e| format!("Failed to write 480p playlist: {}", e))?;

        // 4. Create a dummy solid black poster image
        // A tiny 1x1 solid black pixel GIF/PNG as poster
        let poster_bytes = &[
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0x60, 0x60, 0x60, 0x00,
            0x00, 0x00, 0x04, 0x00, 0x01, 0x27, 0x39, 0xDD, 0x97, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
            0x44, 0xAE, 0x42, 0x60, 0x82
        ];
        fs::write(stream_dir.join("poster.jpg"), poster_bytes)
            .map_err(|e| format!("Failed to write mock poster: {}", e))?;

        // 5. Create a Mock Sprite Sheet image (using the same 1x1 black image)
        fs::write(stream_dir.join("sprite_001.jpg"), poster_bytes)
            .map_err(|e| format!("Failed to write mock sprite sheet: {}", e))?;

        // 6. Write Mock Sprite VTT (maps timestamps 0s to 120s to sprite_001.jpg)
        let mut vtt_content = String::from("WEBVTT\n\n");
        let interval = 5;
        for i in 0..24 {
            let start = i * interval;
            let end = (i + 1) * interval;
            writeln!(
                vtt_content,
                "00:{:02}:{:02}.000 --> 00:{:02}:{:02}.000\nsprite_001.jpg#xywh=0,0,160,90\n",
                start / 60, start % 60,
                end / 60, end % 60
            ).unwrap();
        }
        fs::write(stream_dir.join("sprite.vtt"), vtt_content)
            .map_err(|e| format!("Failed to write mock sprite VTT: {}", e))?;

        Ok(TranscodeOutput {
            playlist_path: stream_dir.join("master.m3u8"),
            thumbnail_path: stream_dir.join("poster.jpg"),
            sprite_vtt_path: stream_dir.join("sprite.vtt"),
            is_mock: true,
        })
    }
}
