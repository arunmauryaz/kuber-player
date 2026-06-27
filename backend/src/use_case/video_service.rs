use crate::domain::video::{Video, VideoStatus, Chapter, VideoRepository};
use crate::infrastructure::storage::StorageManager;
use crate::use_case::job_queue::JobQueue;
use std::sync::Arc;
use std::path::PathBuf;
use chrono::Utc;

pub struct VideoService {
    db: Arc<dyn VideoRepository>,
    storage: StorageManager,
    job_queue: JobQueue,
}

impl VideoService {
    pub fn new(
        db: Arc<dyn VideoRepository>,
        storage: StorageManager,
        job_queue: JobQueue,
    ) -> Self {
        Self { db, storage, job_queue }
    }

    pub async fn create_video(
        &self,
        title: &str,
        filename: &str,
        size: i64,
    ) -> Result<Video, sqlx::Error> {
        let video_id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().naive_utc();
        
        let video = Video {
            id: video_id,
            title: title.to_string(),
            filename: filename.to_string(),
            status: VideoStatus::Pending,
            duration: 0.0,
            width: None,
            height: None,
            bitrate: None,
            codec: None,
            size,
            error_message: None,
            created_at: now,
            updated_at: now,
        };

        self.db.create(&video).await?;
        Ok(video)
    }

    pub async fn get_video(&self, id: &str) -> Result<Option<Video>, sqlx::Error> {
        self.db.find_by_id(id).await
    }

    pub async fn list_videos(&self) -> Result<Vec<Video>, sqlx::Error> {
        self.db.list_all().await
    }

    pub async fn get_chapters(&self, video_id: &str) -> Result<Vec<Chapter>, sqlx::Error> {
        self.db.find_chapters_by_video_id(video_id).await
    }

    pub async fn submit_to_transcode(&self, video_id: &str, temp_path: PathBuf) -> Result<(), String> {
        self.job_queue.submit(video_id.to_string(), temp_path).await
    }

    pub async fn delete_video(&self, id: &str) -> Result<(), String> {
        // Delete database records (on delete cascade handles chapters/events if configured, else clean manually)
        self.db.delete(id).await
            .map_err(|e| format!("Failed to delete video from database: {}", e))?;

        // Delete physical files
        self.storage.delete_video_files(id)
            .map_err(|e| format!("Failed to delete video files from storage: {}", e))?;

        Ok(())
    }
}
