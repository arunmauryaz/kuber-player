use crate::domain::video::{VideoRepository, VideoStatus, Chapter};
use crate::infrastructure::transcoder::VideoTranscoder;
use crate::infrastructure::storage::StorageManager;
use tokio::sync::mpsc;
use std::sync::Arc;
use std::path::PathBuf;
use tracing::{info, error};

#[derive(Debug)]
pub struct TranscodeJob {
    pub video_id: String,
    pub input_path: PathBuf,
}

#[derive(Clone)]
pub struct JobQueue {
    sender: mpsc::Sender<TranscodeJob>,
}

impl JobQueue {
    pub fn new(
        db: Arc<dyn VideoRepository>,
        transcoder: Arc<dyn VideoTranscoder>,
        storage: StorageManager,
        buffer_size: usize,
    ) -> Self {
        let (tx, rx) = mpsc::channel(buffer_size);

        // Spawn background worker
        tokio::spawn(async move {
            Self::worker_loop(rx, db, transcoder, storage).await;
        });

        Self { sender: tx }
    }

    pub async fn submit(&self, video_id: String, input_path: PathBuf) -> Result<(), String> {
        let job = TranscodeJob { video_id, input_path };
        self.sender.send(job).await
            .map_err(|e| format!("Failed to submit job to queue: {}", e))?;
        Ok(())
    }

    async fn worker_loop(
        mut rx: mpsc::Receiver<TranscodeJob>,
        db: Arc<dyn VideoRepository>,
        transcoder: Arc<dyn VideoTranscoder>,
        storage: StorageManager,
    ) {
        info!("Background transcoding worker started.");
        
        while let Some(job) = rx.recv().await {
            info!("Processing transcode job for video: {}", job.video_id);

            // Update status to processing
            if let Err(e) = db.update_status(&job.video_id, VideoStatus::Processing, None).await {
                error!("Failed to update video status to Processing for video {}: {:?}", job.video_id, e);
                continue;
            }

            match transcoder.probe(&job.input_path).await {
                Ok(metadata) => {
                    // Update metadata in DB
                    let codec_str = metadata.codec.clone().unwrap_or_else(|| "h264".to_string());
                    if let Err(e) = db.update_metadata(
                        &job.video_id,
                        metadata.duration,
                        metadata.width.unwrap_or(0),
                        metadata.height.unwrap_or(0),
                        metadata.bitrate.unwrap_or(0),
                        &codec_str
                    ).await {
                        error!("Failed to save probed metadata for {}: {:?}", job.video_id, e);
                    }

                    // Run the actual transcode
                    match transcoder.transcode(&job.video_id, &job.input_path, &metadata).await {
                        Ok(_out) => {
                            info!("Transcoding completed successfully for video: {}", job.video_id);

                            // Auto-generate some chapters if there are none (every 30 seconds, up to duration)
                            let duration = metadata.duration;
                            let chapter_interval = 30.0;
                            let total_chapters = (duration / chapter_interval).ceil() as i32;
                            for i in 0..total_chapters {
                                let start = i as f64 * chapter_interval;
                                let end = ((i + 1) as f64 * chapter_interval).min(duration);
                                let chap = Chapter {
                                    id: uuid::Uuid::new_v4().to_string(),
                                    video_id: job.video_id.clone(),
                                    title: format!("Chapter {}", i + 1),
                                    start_time: start,
                                    end_time: end,
                                };
                                let _ = db.add_chapter(&chap).await;
                            }

                            // Update status to completed
                            let _ = db.update_status(&job.video_id, VideoStatus::Completed, None).await;
                        }
                        Err(err) => {
                            error!("Transcoding failed for video {}: {}", job.video_id, err);
                            let _ = db.update_status(&job.video_id, VideoStatus::Failed, Some(&err)).await;
                        }
                    }
                }
                Err(err) => {
                    error!("Metadata probe failed for video {}: {}", job.video_id, err);
                    let _ = db.update_status(&job.video_id, VideoStatus::Failed, Some(&err)).await;
                }
            }

            // Cleanup raw upload file
            if job.input_path.exists() {
                if let Err(e) = std::fs::remove_file(&job.input_path) {
                    error!("Failed to delete temporary raw file {:?}: {:?}", job.input_path, e);
                }
            }
        }

        info!("Background transcoding worker stopped.");
    }
}
