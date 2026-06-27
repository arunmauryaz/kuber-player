use serde::{Deserialize, Serialize};
use chrono::NaiveDateTime;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VideoStatus {
    Pending,
    Processing,
    Completed,
    Failed,
}

impl VideoStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            VideoStatus::Pending => "pending",
            VideoStatus::Processing => "processing",
            VideoStatus::Completed => "completed",
            VideoStatus::Failed => "failed",
        }
    }
}

impl From<String> for VideoStatus {
    fn from(s: String) -> Self {
        match s.as_str() {
            "processing" => VideoStatus::Processing,
            "completed" => VideoStatus::Completed,
            "failed" => VideoStatus::Failed,
            _ => VideoStatus::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Video {
    pub id: String,
    pub title: String,
    pub filename: String,
    pub status: VideoStatus,
    pub duration: f64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub bitrate: Option<i64>,
    pub codec: Option<String>,
    pub size: i64,
    pub error_message: Option<String>,
    pub created_at: NaiveDateTime,
    pub updated_at: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub id: String,
    pub video_id: String,
    pub title: String,
    pub start_time: f64,
    pub end_time: f64,
}

#[axum::async_trait]
pub trait VideoRepository: Send + Sync {
    async fn create(&self, video: &Video) -> Result<(), sqlx::Error>;
    async fn find_by_id(&self, id: &str) -> Result<Option<Video>, sqlx::Error>;
    async fn list_all(&self) -> Result<Vec<Video>, sqlx::Error>;
    async fn update_status(&self, id: &str, status: VideoStatus, error_message: Option<&str>) -> Result<(), sqlx::Error>;
    async fn update_metadata(&self, id: &str, duration: f64, width: i32, height: i32, bitrate: i64, codec: &str) -> Result<(), sqlx::Error>;
    async fn delete(&self, id: &str) -> Result<(), sqlx::Error>;

    async fn add_chapter(&self, chapter: &Chapter) -> Result<(), sqlx::Error>;
    async fn find_chapters_by_video_id(&self, video_id: &str) -> Result<Vec<Chapter>, sqlx::Error>;
}
